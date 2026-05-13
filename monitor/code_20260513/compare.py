"""
数据对比模块 - 支持两天数据对比和CSV导出
增强版：支持对比所有阶段
"""
import csv
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from collections import defaultdict

from common import log


class DataComparator:
    """数据对比器"""
    
    def __init__(self, export_dir: str = "./static/uploads"):
        self.export_dir = Path(export_dir)
        self.export_dir.mkdir(parents=True, exist_ok=True)
    
    def compare_all_rules(
        self,
        data1: Dict,
        data2: Dict,
        project_id: str,
        tolerance_runtime: float = 0.0,
        tolerance_memory: float = 0.0
    ) -> Dict:
        """
        对比所有阶段的数据
        
        Args:
            data1: 第一天数据
            data2: 第二天数据
            project_id: 项目ID
            tolerance_runtime: runtime误差范围
            tolerance_memory: memory误差范围
        
        Returns:
            包含所有阶段对比结果和汇总的字典
        """
        result = {
            "project_id": project_id,
            "date1": None,
            "date2": None,
            "mode": "all_rules",
            "rules_comparison": [],
            "summary": {
                "total_rules": 0,
                "rules_with_data": 0,
                "rules_without_data": 0,
                "runtime": {
                    "total_increase": 0,
                    "total_decrease": 0,
                    "avg_change_pct": 0,
                    "max_increase_rule": None,
                    "max_decrease_rule": None,
                    "max_increase_pct": 0,
                    "max_decrease_pct": 0
                },
                "memory": {
                    "total_increase": 0,
                    "total_decrease": 0,
                    "avg_change_pct": 0,
                    "max_increase_rule": None,
                    "max_decrease_rule": None,
                    "max_increase_pct": 0,
                    "max_decrease_pct": 0
                }
            }
        }
        
        # 获取所有阶段名称
        all_rules1 = set(data1.get("rules", []))
        all_rules2 = set(data2.get("rules", []))
        all_rules = sorted(all_rules1 | all_rules2)
        
        if not all_rules:
            return result
        
        # 获取日期信息
        result["date1"] = data1.get("dates", [None])[0] if data1.get("dates") else None
        result["date2"] = data2.get("dates", [None])[0] if data2.get("dates") else None
        
        runtime_changes_pct = []
        memory_changes_pct = []
        
        for rule in all_rules:
            rule_data1 = data1.get("rule_data", {}).get(rule, {})
            rule_data2 = data2.get("rule_data", {}).get(rule, {})
            
            runtimes1 = rule_data1.get("runtimes", [])
            runtimes2 = rule_data2.get("runtimes", [])
            memories1 = rule_data1.get("memories", [])
            memories2 = rule_data2.get("memories", [])
            
            # 获取有效数据
            runtime1 = runtimes1[0] if runtimes1 else None
            runtime2 = runtimes2[0] if runtimes2 else None
            memory1 = memories1[0] if memories1 else None
            memory2 = memories2[0] if memories2 else None
            
            has_data = runtime1 is not None and runtime2 is not None
            
            rule_comparison = {
                "rule_name": rule,
                "has_data": has_data,
                "runtime1": round(runtime1, 2) if runtime1 is not None else None,
                "runtime2": round(runtime2, 2) if runtime2 is not None else None,
                "memory1": round(memory1, 2) if memory1 is not None else None,
                "memory2": round(memory2, 2) if memory2 is not None else None,
            }
            
            if has_data:
                runtime_diff = runtime2 - runtime1
                runtime_change_pct = (runtime_diff / runtime1 * 100) if runtime1 != 0 else 0
                runtime_status = self._get_status(runtime_diff, tolerance_runtime)
                
                memory_diff = None
                memory_change_pct = None
                memory_status = "N/A"
                
                if memory1 is not None and memory2 is not None:
                    memory_diff = memory2 - memory1
                    memory_change_pct = (memory_diff / memory1 * 100) if memory1 != 0 else 0
                    memory_status = self._get_status(memory_diff, tolerance_memory)
                
                rule_comparison.update({
                    "runtime_diff": round(runtime_diff, 2),
                    "runtime_change_pct": round(runtime_change_pct, 2),
                    "runtime_status": runtime_status,
                    "runtime_significant": abs(runtime_diff) > tolerance_runtime,
                    "memory_diff": round(memory_diff, 2) if memory_diff is not None else None,
                    "memory_change_pct": round(memory_change_pct, 2) if memory_change_pct is not None else None,
                    "memory_status": memory_status,
                    "memory_significant": abs(memory_diff) > tolerance_memory if memory_diff is not None else False
                })
                
                # 收集变化率用于统计
                runtime_changes_pct.append(abs(runtime_change_pct))
                if memory_change_pct is not None:
                    memory_changes_pct.append(abs(memory_change_pct))
                
                # 统计增减
                if runtime_change_pct > tolerance_runtime:
                    result["summary"]["runtime"]["total_increase"] += 1
                elif runtime_change_pct < -tolerance_runtime:
                    result["summary"]["runtime"]["total_decrease"] += 1
                
                # 记录最大变化
                if runtime_change_pct > result["summary"]["runtime"]["max_increase_pct"]:
                    result["summary"]["runtime"]["max_increase_pct"] = runtime_change_pct
                    result["summary"]["runtime"]["max_increase_rule"] = rule
                
                if runtime_change_pct < result["summary"]["runtime"]["max_decrease_pct"]:
                    result["summary"]["runtime"]["max_decrease_pct"] = runtime_change_pct
                    result["summary"]["runtime"]["max_decrease_rule"] = rule
                
                # Memory统计
                if memory_change_pct is not None:
                    if memory_change_pct > tolerance_memory:
                        result["summary"]["memory"]["total_increase"] += 1
                    elif memory_change_pct < -tolerance_memory:
                        result["summary"]["memory"]["total_decrease"] += 1
                    
                    if memory_change_pct > result["summary"]["memory"]["max_increase_pct"]:
                        result["summary"]["memory"]["max_increase_pct"] = memory_change_pct
                        result["summary"]["memory"]["max_increase_rule"] = rule
                    
                    if memory_change_pct < result["summary"]["memory"]["max_decrease_pct"]:
                        result["summary"]["memory"]["max_decrease_pct"] = memory_change_pct
                        result["summary"]["memory"]["max_decrease_rule"] = rule
            else:
                rule_comparison.update({
                    "runtime_diff": None,
                    "runtime_change_pct": None,
                    "runtime_status": "no_data",
                    "runtime_significant": False,
                    "memory_diff": None,
                    "memory_change_pct": None,
                    "memory_status": "no_data",
                    "memory_significant": False
                })
            
            result["rules_comparison"].append(rule_comparison)
        
        # 计算汇总统计
        result["summary"]["total_rules"] = len(all_rules)
        result["summary"]["rules_with_data"] = len([r for r in result["rules_comparison"] if r["has_data"]])
        result["summary"]["rules_without_data"] = result["summary"]["total_rules"] - result["summary"]["rules_with_data"]
        
        if runtime_changes_pct:
            result["summary"]["runtime"]["avg_change_pct"] = round(
                sum(runtime_changes_pct) / len(runtime_changes_pct), 2
            )
        
        if memory_changes_pct:
            result["summary"]["memory"]["avg_change_pct"] = round(
                sum(memory_changes_pct) / len(memory_changes_pct), 2
            )
        
        # 按变化率排序
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
        tolerance_memory: float = 0.0
    ) -> Dict:
        """
        对比单个阶段的数据（原有功能）
        """
        result = {
            "project_id": project_id,
            "rule_name": rule_name,
            "date1": None,
            "date2": None,
            "mode": "single_rule",
            "comparisons": [],
            "summary": {
                "total": 0,
                "runtime_increased": 0,
                "runtime_decreased": 0,
                "runtime_unchanged": 0,
                "memory_increased": 0,
                "memory_decreased": 0,
                "memory_unchanged": 0,
                "runtime_max_change": 0,
                "memory_max_change": 0,
                "runtime_avg_change": 0,
                "memory_avg_change": 0
            }
        }
        
        # 获取rule_data
        rule_data1 = data1.get("rule_data", {}).get(rule_name, {})
        rule_data2 = data2.get("rule_data", {}).get(rule_name, {})
        
        dates1 = rule_data1.get("dates", [])
        dates2 = rule_data2.get("dates", [])
        
        if not dates1 or not dates2:
            return result
        
        result["date1"] = dates1[0] if dates1 else None
        result["date2"] = dates2[0] if dates2 else None
        
        runtimes1 = rule_data1.get("runtimes", [])
        runtimes2 = rule_data2.get("runtimes", [])
        memories1 = rule_data1.get("memories", [])
        memories2 = rule_data2.get("memories", [])
        
        min_len = min(len(runtimes1), len(runtimes2))
        
        runtime_changes = []
        memory_changes = []
        
        for i in range(min_len):
            runtime1 = runtimes1[i] if i < len(runtimes1) else None
            runtime2 = runtimes2[i] if i < len(runtimes2) else None
            memory1 = memories1[i] if i < len(memories1) else None
            memory2 = memories2[i] if i < len(memories2) else None
            
            if runtime1 is None or runtime2 is None:
                continue
            
            runtime_diff = runtime2 - runtime1
            runtime_change_pct = (runtime_diff / runtime1 * 100) if runtime1 != 0 else 0
            
            memory_diff = 0
            memory_change_pct = 0
            if memory1 is not None and memory2 is not None:
                memory_diff = memory2 - memory1
                memory_change_pct = (memory_diff / memory1 * 100) if memory1 != 0 else 0
            
            runtime_significant = abs(runtime_diff) > tolerance_runtime
            memory_significant = abs(memory_diff) > tolerance_memory
            
            comparison = {
                "index": i,
                "date": dates1[i] if i < len(dates1) else f"Day{i+1}",
                "runtime1": round(runtime1, 2),
                "runtime2": round(runtime2, 2),
                "runtime_diff": round(runtime_diff, 2),
                "runtime_change_pct": round(runtime_change_pct, 2),
                "runtime_status": self._get_status(runtime_diff, tolerance_runtime),
                "runtime_significant": runtime_significant,
                "memory1": round(memory1, 2) if memory1 is not None else None,
                "memory2": round(memory2, 2) if memory2 is not None else None,
                "memory_diff": round(memory_diff, 2) if memory_diff is not None else None,
                "memory_change_pct": round(memory_change_pct, 2) if memory_change_pct is not None else None,
                "memory_status": self._get_status(memory_diff, tolerance_memory) if memory_diff is not None else "N/A",
                "memory_significant": memory_significant
            }
            
            result["comparisons"].append(comparison)
            
            if runtime_diff > tolerance_runtime:
                result["summary"]["runtime_increased"] += 1
            elif runtime_diff < -tolerance_runtime:
                result["summary"]["runtime_decreased"] += 1
            else:
                result["summary"]["runtime_unchanged"] += 1
            
            if memory_diff is not None:
                if memory_diff > tolerance_memory:
                    result["summary"]["memory_increased"] += 1
                elif memory_diff < -tolerance_memory:
                    result["summary"]["memory_decreased"] += 1
                else:
                    result["summary"]["memory_unchanged"] += 1
            
            runtime_changes.append(abs(runtime_change_pct))
            memory_changes.append(abs(memory_change_pct))
        
        result["summary"]["total"] = len(result["comparisons"])
        
        if runtime_changes:
            result["summary"]["runtime_max_change"] = round(max(runtime_changes), 2)
            result["summary"]["runtime_avg_change"] = round(sum(runtime_changes) / len(runtime_changes), 2)
        
        if memory_changes:
            result["summary"]["memory_max_change"] = round(max(memory_changes), 2)
            result["summary"]["memory_avg_change"] = round(sum(memory_changes) / len(memory_changes), 2)
        
        return result
    
    def compare_data(
        self,
        data1: Dict,
        data2: Dict,
        project_id: str,
        rule_name: str = None,
        tolerance_runtime: float = 0.0,
        tolerance_memory: float = 0.0
    ) -> Dict:
        """
        统一对比入口
        如果 rule_name 为 "all" 或 None，则对比所有阶段
        """
        if rule_name == "all" or rule_name is None:
            return self.compare_all_rules(data1, data2, project_id, tolerance_runtime, tolerance_memory)
        else:
            return self.compare_single_rule(data1, data2, project_id, rule_name, tolerance_runtime, tolerance_memory)
    
    def _get_status(self, diff: float, tolerance: float) -> str:
        """获取变化状态"""
        if diff > tolerance:
            return "increase"
        elif diff < -tolerance:
            return "decrease"
        return "unchanged"
    
    def export_to_csv(
        self,
        compare_result: Dict,
        filename: str = None
    ) -> str:
        """
        导出对比结果到CSV
        """
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            mode = compare_result.get("mode", "single_rule")
            filename = f"compare_{compare_result['project_id']}_{mode}_{timestamp}.csv"
        
        filepath = self.export_dir / filename
        
        with open(filepath, 'w', newline='', encoding='utf-8-sig') as csvfile:
            writer = csv.writer(csvfile)
            
            # 写入元信息
            writer.writerow(["性能对比报告"])
            writer.writerow(["生成时间", datetime.now().strftime("%Y-%m-%d %H:%M:%S")])
            writer.writerow(["项目", compare_result["project_id"]])
            writer.writerow(["对比模式", "所有阶段" if compare_result.get("mode") == "all_rules" else f"单个阶段: {compare_result.get('rule_name', 'N/A')}"])
            writer.writerow(["对比日期", f"{compare_result.get('date1', 'N/A')} vs {compare_result.get('date2', 'N/A')}"])
            writer.writerow([])
            
            if compare_result.get("mode") == "all_rules":
                # 所有阶段对比模式
                self._export_all_rules_csv(writer, compare_result)
            else:
                # 单个阶段对比模式
                self._export_single_rule_csv(writer, compare_result)
        
        log(f"对比结果已导出到: {filepath}")
        return str(filepath)
    
    def _export_all_rules_csv(self, writer, result):
        """导出所有阶段对比结果"""
        summary = result.get("summary", {})
        
        # 写入汇总统计
        writer.writerow(["=== 汇总统计 ==="])
        writer.writerow(["指标", "数值"])
        writer.writerow(["总阶段数", summary.get("total_rules", 0)])
        writer.writerow(["有效数据阶段数", summary.get("rules_with_data", 0)])
        writer.writerow(["无数据阶段数", summary.get("rules_without_data", 0)])
        writer.writerow([])
        
        # Runtime统计
        writer.writerow(["=== Runtime 统计 ==="])
        runtime_summary = summary.get("runtime", {})
        writer.writerow(["Runtime增加阶段数", runtime_summary.get("total_increase", 0)])
        writer.writerow(["Runtime减少阶段数", runtime_summary.get("total_decrease", 0)])
        writer.writerow(["Runtime平均变化率(%)", runtime_summary.get("avg_change_pct", 0)])
        writer.writerow(["Runtime最大增加阶段", runtime_summary.get("max_increase_rule", "N/A")])
        writer.writerow(["Runtime最大增加率(%)", runtime_summary.get("max_increase_pct", 0)])
        writer.writerow(["Runtime最大减少阶段", runtime_summary.get("max_decrease_rule", "N/A")])
        writer.writerow(["Runtime最大减少率(%)", runtime_summary.get("max_decrease_pct", 0)])
        writer.writerow([])
        
        # Memory统计
        writer.writerow(["=== Memory 统计 ==="])
        memory_summary = summary.get("memory", {})
        writer.writerow(["Memory增加阶段数", memory_summary.get("total_increase", 0)])
        writer.writerow(["Memory减少阶段数", memory_summary.get("total_decrease", 0)])
        writer.writerow(["Memory平均变化率(%)", memory_summary.get("avg_change_pct", 0)])
        writer.writerow(["Memory最大增加阶段", memory_summary.get("max_increase_rule", "N/A")])
        writer.writerow(["Memory最大增加率(%)", memory_summary.get("max_increase_pct", 0)])
        writer.writerow(["Memory最大减少阶段", memory_summary.get("max_decrease_rule", "N/A")])
        writer.writerow(["Memory最大减少率(%)", memory_summary.get("max_decrease_pct", 0)])
        writer.writerow([])
        
        # 写入详细数据
        writer.writerow(["=== 各阶段详细对比 ==="])
        writer.writerow([
            "阶段名称", "是否有数据",
            "Runtime(基准)", "Runtime(对比)", "Runtime差值", "Runtime变化率(%)", "Runtime状态",
            "Memory(基准)", "Memory(对比)", "Memory差值", "Memory变化率(%)", "Memory状态"
        ])
        
        for comp in result.get("rules_comparison", []):
            writer.writerow([
                comp["rule_name"],
                "是" if comp.get("has_data") else "否",
                comp.get("runtime1", "N/A"),
                comp.get("runtime2", "N/A"),
                comp.get("runtime_diff", "N/A") if comp.get("runtime_diff") is not None else "N/A",
                comp.get("runtime_change_pct", "N/A") if comp.get("runtime_change_pct") is not None else "N/A",
                comp.get("runtime_status", "N/A"),
                comp.get("memory1", "N/A") if comp.get("memory1") is not None else "N/A",
                comp.get("memory2", "N/A") if comp.get("memory2") is not None else "N/A",
                comp.get("memory_diff", "N/A") if comp.get("memory_diff") is not None else "N/A",
                comp.get("memory_change_pct", "N/A") if comp.get("memory_change_pct") is not None else "N/A",
                comp.get("memory_status", "N/A")
            ])
    
    def _export_single_rule_csv(self, writer, result):
        """导出单个阶段对比结果"""
        summary = result.get("summary", {})
        
        # 写入汇总信息
        writer.writerow(["=== 汇总统计 ==="])
        writer.writerow(["指标", "数值"])
        writer.writerow(["总数据点数", summary.get("total", 0)])
        writer.writerow(["Runtime增加点数", summary.get("runtime_increased", 0)])
        writer.writerow(["Runtime减少点数", summary.get("runtime_decreased", 0)])
        writer.writerow(["Runtime不变点数", summary.get("runtime_unchanged", 0)])
        writer.writerow(["Runtime最大变化率(%)", summary.get("runtime_max_change", 0)])
        writer.writerow(["Runtime平均变化率(%)", summary.get("runtime_avg_change", 0)])
        writer.writerow(["Memory增加点数", summary.get("memory_increased", 0)])
        writer.writerow(["Memory减少点数", summary.get("memory_decreased", 0)])
        writer.writerow(["Memory不变点数", summary.get("memory_unchanged", 0)])
        writer.writerow(["Memory最大变化率(%)", summary.get("memory_max_change", 0)])
        writer.writerow(["Memory平均变化率(%)", summary.get("memory_avg_change", 0)])
        writer.writerow([])
        
        # 写入详细数据
        writer.writerow(["=== 详细对比数据 ==="])
        writer.writerow([
            "序号", "日期", 
            "Runtime(基准)", "Runtime(对比)", "Runtime差值", "Runtime变化率(%)", "Runtime状态",
            "Memory(基准)", "Memory(对比)", "Memory差值", "Memory变化率(%)", "Memory状态"
        ])
        
        for comp in result.get("comparisons", []):
            writer.writerow([
                comp["index"] + 1,
                comp["date"],
                comp["runtime1"],
                comp["runtime2"],
                comp["runtime_diff"],
                comp["runtime_change_pct"],
                comp["runtime_status"],
                comp["memory1"] if comp["memory1"] is not None else "N/A",
                comp["memory2"] if comp["memory2"] is not None else "N/A",
                comp["memory_diff"] if comp["memory_diff"] is not None else "N/A",
                comp["memory_change_pct"] if comp["memory_change_pct"] is not None else "N/A",
                comp["memory_status"]
            ])


# 全局对比器实例
comparator = DataComparator()