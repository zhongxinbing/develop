"""
数据对比模块 - 支持两天数据对比和CSV导出
"""
import csv
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from functools import lru_cache

from common import log


class DataComparator:
    """数据对比器类"""
    
    def __init__(self, export_dir: str = "./static/uploads"):
        self.export_dir = Path(export_dir)
        self.export_dir.mkdir(parents=True, exist_ok=True)
    
    @staticmethod
    def _is_significant(diff: float, tolerance: float, mode: str = 'absolute', base_value: float = None) -> bool:
        """判断差异是否超出容差范围"""
        if diff is None:
            return False
        if mode == 'percentage' and base_value is not None and base_value != 0:
            return abs(diff / base_value * 100) > tolerance
        return abs(diff) > tolerance
    
    @staticmethod
    def _get_status(diff: float, tolerance: float, mode: str = 'absolute', base_value: float = None) -> str:
        """获取变化状态"""
        if diff is None:
            return "no_data"
        if mode == 'percentage' and base_value is not None and base_value != 0:
            actual = abs(diff / base_value * 100)
        else:
            actual = abs(diff)
        
        if actual > tolerance:
            return "increase" if diff > 0 else "decrease"
        return "unchanged"
    
    @staticmethod
    def _calc_change_pct(current: float, previous: float) -> float:
        """计算变化百分比"""
        if previous == 0:
            return 0 if current == 0 else (100 if current > 0 else -100)
        return (current - previous) / previous * 100
    
    def compare_all_rules(
        self,
        data1: Dict,
        data2: Dict,
        project_id: str,
        tolerance_runtime: float = 0.0,
        tolerance_memory: float = 0.0,
        tolerance_mode: str = 'absolute',
        compare_dimension: str = 'both'
    ) -> Dict:
        """对比所有阶段的数据"""
        compare_runtime = compare_dimension in ['runtime', 'both']
        compare_memory = compare_dimension in ['memory', 'both']
        
        result = {
            "project_id": project_id,
            "date1": data1.get("dates", [None])[0] if data1.get("dates") else None,
            "date2": data2.get("dates", [None])[0] if data2.get("dates") else None,
            "mode": "all_rules",
            "tolerance_mode": tolerance_mode,
            "compare_dimension": compare_dimension,
            "rules_comparison": [],
            "summary": {
                "total_rules": 0,
                "rules_with_data": 0,
                "rules_without_data": 0,
            }
        }
        
        # 初始化统计
        if compare_runtime:
            result["summary"]["runtime"] = self._init_runtime_summary()
        if compare_memory:
            result["summary"]["memory"] = self._init_memory_summary()
        
        # 收集所有阶段
        all_rules = sorted(set(data1.get("rules", [])) | set(data2.get("rules", [])))
        
        if not all_rules:
            return result
        
        runtime_changes = []
        memory_changes = []
        
        for rule in all_rules:
            rule_data1 = data1.get("rule_data", {}).get(rule, {})
            rule_data2 = data2.get("rule_data", {}).get(rule, {})
            
            runtime1 = rule_data1.get("runtimes", [None])[0] if rule_data1.get("runtimes") else None
            runtime2 = rule_data2.get("runtimes", [None])[0] if rule_data2.get("runtimes") else None
            memory1 = rule_data1.get("memories", [None])[0] if rule_data1.get("memories") else None
            memory2 = rule_data2.get("memories", [None])[0] if rule_data2.get("memories") else None
            
            has_data = self._check_has_data(runtime1, runtime2, memory1, memory2, compare_dimension)
            
            rule_comparison = self._build_rule_comparison(
                rule, has_data, runtime1, runtime2, memory1, memory2,
                tolerance_runtime, tolerance_memory, tolerance_mode,
                compare_runtime, compare_memory
            )
            
            result["rules_comparison"].append(rule_comparison)
            
            # 收集变化数据
            if compare_runtime and runtime1 is not None and runtime2 is not None:
                runtime_changes.append(abs(rule_comparison["runtime_change_pct"]))
                self._update_summary_stats(result["summary"]["runtime"], rule_comparison)
            
            if compare_memory and memory1 is not None and memory2 is not None:
                memory_changes.append(abs(rule_comparison["memory_change_pct"]))
                self._update_summary_stats(result["summary"]["memory"], rule_comparison)
        
        # 更新汇总统计
        result["summary"]["total_rules"] = len(all_rules)
        result["summary"]["rules_with_data"] = len([r for r in result["rules_comparison"] if r["has_data"]])
        result["summary"]["rules_without_data"] = result["summary"]["total_rules"] - result["summary"]["rules_with_data"]
        
        # 计算平均变化率
        if compare_runtime and runtime_changes:
            result["summary"]["runtime"]["avg_change_pct"] = round(sum(runtime_changes) / len(runtime_changes), 2)
            result["summary"]["runtime"]["increase_list"] = self._build_sorted_list(
                result["rules_comparison"], "runtime", True
            )
            result["summary"]["runtime"]["decrease_list"] = self._build_sorted_list(
                result["rules_comparison"], "runtime", False
            )
        
        if compare_memory and memory_changes:
            result["summary"]["memory"]["avg_change_pct"] = round(sum(memory_changes) / len(memory_changes), 2)
            result["summary"]["memory"]["increase_list"] = self._build_sorted_list(
                result["rules_comparison"], "memory", True
            )
            result["summary"]["memory"]["decrease_list"] = self._build_sorted_list(
                result["rules_comparison"], "memory", False
            )
        
        # 按变化率排序
        if compare_runtime:
            result["rules_comparison"].sort(
                key=lambda x: abs(x.get("runtime_change_pct", 0) or 0),
                reverse=True
            )
        
        return result
    
    def compare_single_rule(
        self,
        data1: Dict,
        data2: Dict,
        project_id: str,
        rule_name: str,
        tolerance_runtime: float = 0.0,
        tolerance_memory: float = 0.0,
        tolerance_mode: str = 'absolute',
        compare_dimension: str = 'both'
    ) -> Dict:
        """对比单个阶段的数据"""
        compare_runtime = compare_dimension in ['runtime', 'both']
        compare_memory = compare_dimension in ['memory', 'both']
        
        rule_data1 = data1.get("rule_data", {}).get(rule_name, {})
        rule_data2 = data2.get("rule_data", {}).get(rule_name, {})
        
        dates1 = rule_data1.get("dates", [])
        dates2 = rule_data2.get("dates", [])
        
        if not dates1 or not dates2:
            return self._empty_single_rule_result(project_id, rule_name, compare_dimension)
        
        result = {
            "project_id": project_id,
            "rule_name": rule_name,
            "date1": dates1[0],
            "date2": dates2[0],
            "mode": "single_rule",
            "tolerance_mode": tolerance_mode,
            "compare_dimension": compare_dimension,
            "comparisons": [],
            "summary": {
                "total": 0,
            }
        }
        
        # 初始化统计
        if compare_runtime:
            result["summary"].update({
                "runtime_increased": 0, "runtime_decreased": 0, "runtime_unchanged": 0,
                "runtime_max_change": 0, "runtime_avg_change": 0,
                "runtime_increase_list": [], "runtime_decrease_list": []
            })
        
        if compare_memory:
            result["summary"].update({
                "memory_increased": 0, "memory_decreased": 0, "memory_unchanged": 0,
                "memory_max_change": 0, "memory_avg_change": 0,
                "memory_increase_list": [], "memory_decrease_list": []
            })
        
        runtimes1 = rule_data1.get("runtimes", [])
        runtimes2 = rule_data2.get("runtimes", [])
        memories1 = rule_data1.get("memories", [])
        memories2 = rule_data2.get("memories", [])
        
        min_len = min(len(runtimes1), len(runtimes2))
        
        runtime_changes = []
        memory_changes = []
        runtime_items = []
        memory_items = []
        
        for i in range(min_len):
            runtime1 = runtimes1[i] if i < len(runtimes1) else None
            runtime2 = runtimes2[i] if i < len(runtimes2) else None
            memory1 = memories1[i] if i < len(memories1) else None
            memory2 = memories2[i] if i < len(memories2) else None
            
            comparison = {
                "index": i,
                "date": dates1[i] if i < len(dates1) else f"Day{i+1}",
            }
            
            # 处理Runtime对比
            if compare_runtime and runtime1 is not None and runtime2 is not None:
                runtime_diff = runtime2 - runtime1
                runtime_change_pct = self._calc_change_pct(runtime2, runtime1)
                runtime_significant = self._is_significant(runtime_diff, tolerance_runtime, tolerance_mode, runtime1)
                
                comparison.update({
                    "runtime1": round(runtime1, 2),
                    "runtime2": round(runtime2, 2),
                    "runtime_diff": round(runtime_diff, 2),
                    "runtime_change_pct": round(runtime_change_pct, 2),
                    "runtime_status": self._get_status(runtime_diff, tolerance_runtime, tolerance_mode, runtime1),
                    "runtime_significant": runtime_significant,
                })
                
                if self._is_significant(runtime_diff, tolerance_runtime, tolerance_mode, runtime1):
                    if runtime_diff > 0:
                        result["summary"]["runtime_increased"] += 1
                        runtime_items.append({
                            "date": comparison["date"],
                            "change_pct": round(runtime_change_pct, 2),
                            "value": round(runtime_diff, 2)
                        })
                    else:
                        result["summary"]["runtime_decreased"] += 1
                        runtime_items.append({
                            "date": comparison["date"],
                            "change_pct": round(abs(runtime_change_pct), 2),
                            "value": round(runtime_diff, 2)
                        })
                else:
                    result["summary"]["runtime_unchanged"] += 1
                
                runtime_changes.append(abs(runtime_change_pct))
            elif compare_runtime:
                comparison.update(self._empty_runtime_comparison())
            
            # 处理Memory对比
            if compare_memory and memory1 is not None and memory2 is not None:
                memory_diff = memory2 - memory1
                memory_change_pct = self._calc_change_pct(memory2, memory1)
                memory_significant = self._is_significant(memory_diff, tolerance_memory, tolerance_mode, memory1)
                
                comparison.update({
                    "memory1": round(memory1, 2),
                    "memory2": round(memory2, 2),
                    "memory_diff": round(memory_diff, 2),
                    "memory_change_pct": round(memory_change_pct, 2),
                    "memory_status": self._get_status(memory_diff, tolerance_memory, tolerance_mode, memory1),
                    "memory_significant": memory_significant,
                })
                
                if self._is_significant(memory_diff, tolerance_memory, tolerance_mode, memory1):
                    if memory_diff > 0:
                        result["summary"]["memory_increased"] += 1
                        memory_items.append({
                            "date": comparison["date"],
                            "change_pct": round(memory_change_pct, 2),
                            "value": round(memory_diff, 2)
                        })
                    else:
                        result["summary"]["memory_decreased"] += 1
                        memory_items.append({
                            "date": comparison["date"],
                            "change_pct": round(abs(memory_change_pct), 2),
                            "value": round(memory_diff, 2)
                        })
                else:
                    result["summary"]["memory_unchanged"] += 1
                
                memory_changes.append(abs(memory_change_pct))
            elif compare_memory:
                comparison.update(self._empty_memory_comparison())
            
            result["comparisons"].append(comparison)
        
        result["summary"]["total"] = len(result["comparisons"])
        
        # 计算汇总统计
        self._finalize_single_rule_summary(result, compare_runtime, compare_memory,
                                           runtime_changes, memory_changes,
                                           runtime_items, memory_items)
        
        return result
    
    def compare_data(self, data1: Dict, data2: Dict, project_id: str, rule_name: str = None,
                     tolerance_runtime: float = 0.0, tolerance_memory: float = 0.0,
                     tolerance_mode: str = 'absolute', compare_dimension: str = 'both') -> Dict:
        """统一对比入口"""
        if rule_name == "all" or rule_name is None:
            return self.compare_all_rules(data1, data2, project_id,
                                          tolerance_runtime, tolerance_memory,
                                          tolerance_mode, compare_dimension)
        return self.compare_single_rule(data1, data2, project_id, rule_name,
                                        tolerance_runtime, tolerance_memory,
                                        tolerance_mode, compare_dimension)
    
    def export_to_csv(self, compare_result: Dict, filename: str = None) -> str:
        """导出对比结果到CSV文件"""
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            mode = compare_result.get("mode", "single_rule")
            filename = f"compare_{compare_result['project_id']}_{mode}_{timestamp}.csv"
        
        filepath = self.export_dir / filename
        
        with open(filepath, 'w', newline='', encoding='utf-8-sig') as csvfile:
            writer = csv.writer(csvfile)
            
            # 写入报告头
            writer.writerow(["性能对比报告"])
            writer.writerow(["生成时间", datetime.now().strftime("%Y-%m-%d %H:%M:%S")])
            writer.writerow(["项目", compare_result["project_id"]])
            writer.writerow(["对比模式", "所有阶段" if compare_result.get("mode") == "all_rules" else f"单个阶段: {compare_result.get('rule_name', 'N/A')}"])
            writer.writerow(["对比维度", compare_result.get("compare_dimension", "both")])
            writer.writerow(["对比日期", f"{compare_result.get('date1', 'N/A')} vs {compare_result.get('date2', 'N/A')}"])
            writer.writerow([])
            
            if compare_result.get("mode") == "all_rules":
                self._export_all_rules_csv(writer, compare_result)
            else:
                self._export_single_rule_csv(writer, compare_result)
        
        log(f"对比结果已导出到: {filepath}")
        return str(filepath)
    
    # ========== 私有辅助方法 ==========
    
    @staticmethod
    def _init_runtime_summary() -> Dict:
        return {
            "total_increase": 0, "total_decrease": 0, "avg_change_pct": 0,
            "max_increase_rule": None, "max_decrease_rule": None,
            "max_increase_pct": 0, "max_decrease_pct": 0,
            "increase_list": [], "decrease_list": []
        }
    
    @staticmethod
    def _init_memory_summary() -> Dict:
        return {
            "total_increase": 0, "total_decrease": 0, "avg_change_pct": 0,
            "max_increase_rule": None, "max_decrease_rule": None,
            "max_increase_pct": 0, "max_decrease_pct": 0,
            "increase_list": [], "decrease_list": []
        }
    
    @staticmethod
    def _check_has_data(runtime1, runtime2, memory1, memory2, compare_dimension: str) -> bool:
        if compare_dimension == 'both':
            return (runtime1 is not None and runtime2 is not None and
                    memory1 is not None and memory2 is not None)
        elif compare_dimension == 'runtime':
            return runtime1 is not None and runtime2 is not None
        return memory1 is not None and memory2 is not None
    
    def _build_rule_comparison(self, rule: str, has_data: bool,
                               runtime1, runtime2, memory1, memory2,
                               tolerance_runtime, tolerance_memory,
                               tolerance_mode, compare_runtime, compare_memory) -> Dict:
        result = {"rule_name": rule, "has_data": has_data}
        
        if compare_runtime:
            result.update(self._build_runtime_comparison(
                runtime1, runtime2, tolerance_runtime, tolerance_mode
            ))
        
        if compare_memory:
            result.update(self._build_memory_comparison(
                memory1, memory2, tolerance_memory, tolerance_mode
            ))
        
        return result
    
    def _build_runtime_comparison(self, runtime1, runtime2, tolerance, mode) -> Dict:
        if runtime1 is not None and runtime2 is not None:
            runtime_diff = runtime2 - runtime1
            runtime_change_pct = self._calc_change_pct(runtime2, runtime1)
            return {
                "runtime1": round(runtime1, 2),
                "runtime2": round(runtime2, 2),
                "runtime_diff": round(runtime_diff, 2),
                "runtime_change_pct": round(runtime_change_pct, 2),
                "runtime_status": self._get_status(runtime_diff, tolerance, mode, runtime1),
                "runtime_significant": self._is_significant(runtime_diff, tolerance, mode, runtime1),
            }
        return {
            "runtime1": None, "runtime2": None, "runtime_diff": None,
            "runtime_change_pct": None, "runtime_status": "no_data", "runtime_significant": False
        }
    
    def _build_memory_comparison(self, memory1, memory2, tolerance, mode) -> Dict:
        if memory1 is not None and memory2 is not None:
            memory_diff = memory2 - memory1
            memory_change_pct = self._calc_change_pct(memory2, memory1)
            return {
                "memory1": round(memory1, 2),
                "memory2": round(memory2, 2),
                "memory_diff": round(memory_diff, 2),
                "memory_change_pct": round(memory_change_pct, 2),
                "memory_status": self._get_status(memory_diff, tolerance, mode, memory1),
                "memory_significant": self._is_significant(memory_diff, tolerance, mode, memory1),
            }
        return {
            "memory1": None, "memory2": None, "memory_diff": None,
            "memory_change_pct": None, "memory_status": "no_data", "memory_significant": False
        }
    
    @staticmethod
    def _empty_runtime_comparison() -> Dict:
        return {
            "runtime1": None, "runtime2": None, "runtime_diff": None,
            "runtime_change_pct": None, "runtime_status": "no_data", "runtime_significant": False
        }
    
    @staticmethod
    def _empty_memory_comparison() -> Dict:
        return {
            "memory1": None, "memory2": None, "memory_diff": None,
            "memory_change_pct": None, "memory_status": "no_data", "memory_significant": False
        }
    
    def _empty_single_rule_result(self, project_id: str, rule_name: str, compare_dimension: str) -> Dict:
        return {
            "project_id": project_id, "rule_name": rule_name,
            "mode": "single_rule", "compare_dimension": compare_dimension,
            "comparisons": [], "summary": {"total": 0}
        }
    
    def _update_summary_stats(self, summary: Dict, comparison: Dict) -> None:
        """更新统计汇总"""
        if "runtime_change_pct" in comparison:
            change_pct = comparison["runtime_change_pct"]
            if comparison["runtime_significant"]:
                if change_pct > 0:
                    summary["total_increase"] += 1
                else:
                    summary["total_decrease"] += 1
            
            if change_pct > summary["max_increase_pct"]:
                summary["max_increase_pct"] = change_pct
                summary["max_increase_rule"] = comparison["rule_name"]
            
            if change_pct < summary["max_decrease_pct"]:
                summary["max_decrease_pct"] = change_pct
                summary["max_decrease_rule"] = comparison["rule_name"]
        
        if "memory_change_pct" in comparison:
            change_pct = comparison["memory_change_pct"]
            if comparison["memory_significant"]:
                if change_pct > 0:
                    summary["total_increase"] += 1
                else:
                    summary["total_decrease"] += 1
            
            if change_pct > summary["max_increase_pct"]:
                summary["max_increase_pct"] = change_pct
                summary["max_increase_rule"] = comparison["rule_name"]
            
            if change_pct < summary["max_decrease_pct"]:
                summary["max_decrease_pct"] = change_pct
                summary["max_decrease_rule"] = comparison["rule_name"]
    
    def _build_sorted_list(self, rules_comparison: List[Dict], metric_type: str, is_increase: bool) -> List[Dict]:
        """构建排序后的阶段列表"""
        change_key = f"{metric_type}_change_pct"
        
        filtered = []
        for r in rules_comparison:
            if r.get("has_data", False) and r.get(change_key) is not None:
                change_pct = r[change_key]
                if is_increase and change_pct > 0:
                    filtered.append({"name": r["rule_name"], "change_pct": round(change_pct, 2)})
                elif not is_increase and change_pct < 0:
                    filtered.append({"name": r["rule_name"], "change_pct": round(abs(change_pct), 2)})
        
        filtered.sort(key=lambda x: x["change_pct"], reverse=True)
        return filtered[:10]
    
    def _finalize_single_rule_summary(self, result: Dict, compare_runtime: bool, compare_memory: bool,
                                      runtime_changes: List, memory_changes: List,
                                      runtime_items: List, memory_items: List) -> None:
        """完成单阶段对比的汇总统计"""
        if compare_runtime and runtime_changes:
            result["summary"]["runtime_max_change"] = round(max(runtime_changes), 2)
            result["summary"]["runtime_avg_change"] = round(sum(runtime_changes) / len(runtime_changes), 2)
            runtime_items.sort(key=lambda x: x["change_pct"], reverse=True)
            result["summary"]["runtime_increase_list"] = runtime_items[:10]
            
            runtime_items_dec = [item for item in runtime_items if item["value"] < 0]
            runtime_items_dec.sort(key=lambda x: x["change_pct"], reverse=True)
            result["summary"]["runtime_decrease_list"] = runtime_items_dec[:10]
        
        if compare_memory and memory_changes:
            result["summary"]["memory_max_change"] = round(max(memory_changes), 2)
            result["summary"]["memory_avg_change"] = round(sum(memory_changes) / len(memory_changes), 2)
            memory_items.sort(key=lambda x: x["change_pct"], reverse=True)
            result["summary"]["memory_increase_list"] = memory_items[:10]
            
            memory_items_dec = [item for item in memory_items if item["value"] < 0]
            memory_items_dec.sort(key=lambda x: x["change_pct"], reverse=True)
            result["summary"]["memory_decrease_list"] = memory_items_dec[:10]
    
    def _export_all_rules_csv(self, writer, result: Dict) -> None:
        """导出所有阶段对比结果"""
        summary = result.get("summary", {})
        compare_dimension = result.get("compare_dimension", "both")
        
        writer.writerow(["=== 汇总统计 ==="])
        writer.writerow(["指标", "数值"])
        writer.writerow(["总阶段数", summary.get("total_rules", 0)])
        writer.writerow(["有效数据阶段数", summary.get("rules_with_data", 0)])
        writer.writerow(["无数据阶段数", summary.get("rules_without_data", 0)])
        writer.writerow([])
        
        if compare_dimension in ['runtime', 'both']:
            runtime_summary = summary.get("runtime", {})
            if runtime_summary:
                writer.writerow(["=== Runtime 统计 ==="])
                writer.writerow(["Runtime增加阶段数", runtime_summary.get("total_increase", 0)])
                writer.writerow(["Runtime减少阶段数", runtime_summary.get("total_decrease", 0)])
                writer.writerow(["Runtime平均变化率(%)", runtime_summary.get("avg_change_pct", 0)])
                writer.writerow(["Runtime最大增加阶段", runtime_summary.get("max_increase_rule", "N/A")])
                writer.writerow(["Runtime最大减少阶段", runtime_summary.get("max_decrease_rule", "N/A")])
                
                inc_list = runtime_summary.get("increase_list", [])
                if inc_list:
                    writer.writerow([])
                    writer.writerow(["Runtime增加阶段Top10"])
                    writer.writerow(["阶段名称", "增加率(%)"])
                    for item in inc_list[:10]:
                        writer.writerow([item["name"], item["change_pct"]])
                
                dec_list = runtime_summary.get("decrease_list", [])
                if dec_list:
                    writer.writerow([])
                    writer.writerow(["Runtime减少阶段Top10"])
                    writer.writerow(["阶段名称", "减少率(%)"])
                    for item in dec_list[:10]:
                        writer.writerow([item["name"], item["change_pct"]])
                writer.writerow([])
        
        if compare_dimension in ['memory', 'both']:
            memory_summary = summary.get("memory", {})
            if memory_summary:
                writer.writerow(["=== Memory 统计 ==="])
                writer.writerow(["Memory增加阶段数", memory_summary.get("total_increase", 0)])
                writer.writerow(["Memory减少阶段数", memory_summary.get("total_decrease", 0)])
                writer.writerow(["Memory平均变化率(%)", memory_summary.get("avg_change_pct", 0)])
                writer.writerow(["Memory最大增加阶段", memory_summary.get("max_increase_rule", "N/A")])
                writer.writerow(["Memory最大减少阶段", memory_summary.get("max_decrease_rule", "N/A")])
                
                inc_list = memory_summary.get("increase_list", [])
                if inc_list:
                    writer.writerow([])
                    writer.writerow(["Memory增加阶段Top10"])
                    writer.writerow(["阶段名称", "增加率(%)"])
                    for item in inc_list[:10]:
                        writer.writerow([item["name"], item["change_pct"]])
                
                dec_list = memory_summary.get("decrease_list", [])
                if dec_list:
                    writer.writerow([])
                    writer.writerow(["Memory减少阶段Top10"])
                    writer.writerow(["阶段名称", "减少率(%)"])
                    for item in dec_list[:10]:
                        writer.writerow([item["name"], item["change_pct"]])
                writer.writerow([])
        
        # 写入详细对比数据
        writer.writerow(["=== 各阶段详细对比 ==="])
        headers = ["阶段名称", "是否有数据"]
        
        if compare_dimension in ['runtime', 'both']:
            headers.extend(["Runtime(基准)", "Runtime(对比)", "Runtime差值", "Runtime变化率(%)", "Runtime状态"])
        if compare_dimension in ['memory', 'both']:
            headers.extend(["Memory(基准)", "Memory(对比)", "Memory差值", "Memory变化率(%)", "Memory状态"])
        
        writer.writerow(headers)
        
        for comp in result.get("rules_comparison", []):
            row = [comp["rule_name"], "是" if comp.get("has_data") else "否"]
            
            if compare_dimension in ['runtime', 'both']:
                row.extend(self._format_csv_value(comp, "runtime"))
            if compare_dimension in ['memory', 'both']:
                row.extend(self._format_csv_value(comp, "memory"))
            
            writer.writerow(row)
    
    def _export_single_rule_csv(self, writer, result: Dict) -> None:
        """导出单个阶段对比结果"""
        summary = result.get("summary", {})
        compare_dimension = result.get("compare_dimension", "both")
        
        writer.writerow(["=== 汇总统计 ==="])
        writer.writerow(["指标", "数值"])
        writer.writerow(["总数据点数", summary.get("total", 0)])
        
        if compare_dimension in ['runtime', 'both']:
            writer.writerow(["Runtime增加点数", summary.get("runtime_increased", 0)])
            writer.writerow(["Runtime减少点数", summary.get("runtime_decreased", 0)])
            writer.writerow(["Runtime不变点数", summary.get("runtime_unchanged", 0)])
            writer.writerow(["Runtime最大变化率(%)", summary.get("runtime_max_change", 0)])
            writer.writerow(["Runtime平均变化率(%)", summary.get("runtime_avg_change", 0)])
            
            inc_list = summary.get("runtime_increase_list", [])
            if inc_list:
                writer.writerow([])
                writer.writerow(["Runtime增加Top10"])
                writer.writerow(["日期", "增加率(%)", "增加值"])
                for item in inc_list[:10]:
                    writer.writerow([item["date"], item["change_pct"], item["value"]])
            
            dec_list = summary.get("runtime_decrease_list", [])
            if dec_list:
                writer.writerow([])
                writer.writerow(["Runtime减少Top10"])
                writer.writerow(["日期", "减少率(%)", "减少值"])
                for item in dec_list[:10]:
                    writer.writerow([item["date"], item["change_pct"], abs(item["value"])])
        
        if compare_dimension in ['memory', 'both']:
            writer.writerow([] if compare_dimension in ['runtime', 'both'] else [])
            writer.writerow(["Memory增加点数", summary.get("memory_increased", 0)])
            writer.writerow(["Memory减少点数", summary.get("memory_decreased", 0)])
            writer.writerow(["Memory不变点数", summary.get("memory_unchanged", 0)])
            writer.writerow(["Memory最大变化率(%)", summary.get("memory_max_change", 0)])
            writer.writerow(["Memory平均变化率(%)", summary.get("memory_avg_change", 0)])
            
            inc_list = summary.get("memory_increase_list", [])
            if inc_list:
                writer.writerow([])
                writer.writerow(["Memory增加Top10"])
                writer.writerow(["日期", "增加率(%)", "增加值"])
                for item in inc_list[:10]:
                    writer.writerow([item["date"], item["change_pct"], item["value"]])
            
            dec_list = summary.get("memory_decrease_list", [])
            if dec_list:
                writer.writerow([])
                writer.writerow(["Memory减少Top10"])
                writer.writerow(["日期", "减少率(%)", "减少值"])
                for item in dec_list[:10]:
                    writer.writerow([item["date"], item["change_pct"], abs(item["value"])])
        
        writer.writerow([])
        writer.writerow(["=== 详细对比数据 ==="])
        headers = ["序号", "日期"]
        
        if compare_dimension in ['runtime', 'both']:
            headers.extend(["Runtime(基准)", "Runtime(对比)", "Runtime差值", "Runtime变化率(%)", "Runtime状态"])
        if compare_dimension in ['memory', 'both']:
            headers.extend(["Memory(基准)", "Memory(对比)", "Memory差值", "Memory变化率(%)", "Memory状态"])
        
        writer.writerow(headers)
        
        for comp in result.get("comparisons", []):
            row = [comp["index"] + 1, comp["date"]]
            
            if compare_dimension in ['runtime', 'both']:
                row.extend(self._format_csv_value(comp, "runtime"))
            if compare_dimension in ['memory', 'both']:
                row.extend(self._format_csv_value(comp, "memory"))
            
            writer.writerow(row)
    
    @staticmethod
    def _format_csv_value(comp: Dict, metric: str) -> List[str]:
        """格式化CSV值"""
        prefix = f"{metric}"
        value1 = comp.get(f"{metric}1")
        value2 = comp.get(f"{metric}2")
        diff = comp.get(f"{metric}_diff")
        change_pct = comp.get(f"{metric}_change_pct")
        status = comp.get(f"{metric}_status", "N/A")
        
        return [
            str(value1) if value1 is not None else "N/A",
            str(value2) if value2 is not None else "N/A",
            str(diff) if diff is not None else "N/A",
            str(change_pct) if change_pct is not None else "N/A",
            status
        ]


# 全局对比器实例
comparator = DataComparator()