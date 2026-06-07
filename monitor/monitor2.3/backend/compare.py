"""
数据对比模块
提供性能数据的对比功能
"""
from typing import Dict, List, Any, Optional


class DataComparator:
    """数据对比器"""
    
    def compare(self, data1: Dict, data2: Dict,
                compare_mode: str = 'all',
                rule_filter: Optional[str] = None,
                error_mode: str = 'absolute',
                compare_dimension: str = 'all',
                runtime_tolerance: float = 0,
                memory_tolerance: float = 0) -> Dict:
        """对比两个数据集"""
        
        rules1 = set(data1.keys())
        rules2 = set(data2.keys())
        all_rules = rules1.union(rules2)
        
        if compare_mode != 'all' and rule_filter:
            all_rules = [r for r in all_rules if rule_filter.lower() in r.lower()]
        
        compare_results = []
        
        runtime_increases = []
        runtime_decreases = []
        memory_increases = []
        memory_decreases = []
        runtime_changes = []
        memory_changes = []
        
        for rule in all_rules:
            val1_runtime = data1.get(rule, {}).get('runtime') if rule in data1 else None
            val1_memory = data1.get(rule, {}).get('memory') if rule in data1 else None
            val2_runtime = data2.get(rule, {}).get('runtime') if rule in data2 else None
            val2_memory = data2.get(rule, {}).get('memory') if rule in data2 else None
            
            runtime_diff = None
            memory_diff = None
            runtime_pct = None
            memory_pct = None
            
            if val1_runtime is not None and val2_runtime is not None:
                runtime_diff = val2_runtime - val1_runtime
                runtime_pct = (runtime_diff / val1_runtime * 100) if val1_runtime != 0 else 0
                
                if runtime_diff > 0:
                    runtime_increases.append((rule, runtime_diff, runtime_pct))
                elif runtime_diff < 0:
                    runtime_decreases.append((rule, abs(runtime_diff), abs(runtime_pct)))
                runtime_changes.append(abs(runtime_pct))
            
            if val1_memory is not None and val2_memory is not None:
                memory_diff = val2_memory - val1_memory
                memory_pct = (memory_diff / val1_memory * 100) if val1_memory != 0 else 0
                
                if memory_diff > 0:
                    memory_increases.append((rule, memory_diff, memory_pct))
                elif memory_diff < 0:
                    memory_decreases.append((rule, abs(memory_diff), abs(memory_pct)))
                memory_changes.append(abs(memory_pct))
            
            is_out_of_tolerance = False
            if compare_dimension in ('all', 'runtime') and runtime_pct is not None:
                if abs(runtime_pct) > runtime_tolerance:
                    is_out_of_tolerance = True
            if compare_dimension in ('all', 'memory') and memory_pct is not None:
                if abs(memory_pct) > memory_tolerance:
                    is_out_of_tolerance = True
            
            display_val1 = self._format_value(val1_runtime, val1_memory, compare_dimension)
            display_val2 = self._format_value(val2_runtime, val2_memory, compare_dimension)
            display_diff = self._format_diff(runtime_diff, memory_diff, compare_dimension, error_mode)
            
            compare_results.append({
                'rule': rule,
                'value1': display_val1,
                'value2': display_val2,
                'diff': display_diff,
                'runtime_diff': runtime_diff,
                'memory_diff': memory_diff,
                'runtime_pct': runtime_pct,
                'memory_pct': memory_pct,
                'is_out_of_tolerance': is_out_of_tolerance
            })
        
        runtime_increases.sort(key=lambda x: x[1], reverse=True)
        runtime_decreases.sort(key=lambda x: x[1], reverse=True)
        memory_increases.sort(key=lambda x: x[1], reverse=True)
        memory_decreases.sort(key=lambda x: x[1], reverse=True)
        
        avg_runtime_change = sum(runtime_changes) / len(runtime_changes) if runtime_changes else 0
        avg_memory_change = sum(memory_changes) / len(memory_changes) if memory_changes else 0
        
        statistics = {
            'runtime': {
                'increase_count': len(runtime_increases),
                'decrease_count': len(runtime_decreases),
                'avg_change': round(avg_runtime_change, 2),
                'top_increases': runtime_increases[:10],
                'top_decreases': runtime_decreases[:10],
                'max_increase': runtime_increases[0] if runtime_increases else None,
                'max_decrease': runtime_decreases[0] if runtime_decreases else None
            },
            'memory': {
                'increase_count': len(memory_increases),
                'decrease_count': len(memory_decreases),
                'avg_change': round(avg_memory_change, 2),
                'top_increases': memory_increases[:10],
                'top_decreases': memory_decreases[:10],
                'max_increase': memory_increases[0] if memory_increases else None,
                'max_decrease': memory_decreases[0] if memory_decreases else None
            }
        }
        
        return {
            'statistics': statistics,
            'results': compare_results,
            'total_rules': len(compare_results),
            'out_of_tolerance_count': sum(1 for r in compare_results if r['is_out_of_tolerance'])
        }
    
    def _format_value(self, runtime: Optional[float], memory: Optional[float], 
                      dimension: str) -> str:
        if dimension == 'runtime':
            return f"{runtime:.2f}" if runtime is not None else 'N/A'
        elif dimension == 'memory':
            return f"{memory:.2f}" if memory is not None else 'N/A'
        else:
            runtime_str = f"{runtime:.2f}" if runtime is not None else 'N/A'
            memory_str = f"{memory:.2f}" if memory is not None else 'N/A'
            return f"R:{runtime_str} M:{memory_str}"
    
    def _format_diff(self, runtime_diff: Optional[float], memory_diff: Optional[float],
                     dimension: str, error_mode: str) -> str:
        if dimension == 'runtime':
            if runtime_diff is None:
                return 'N/A'
            return f"{runtime_diff:+.2f}"
        elif dimension == 'memory':
            if memory_diff is None:
                return 'N/A'
            return f"{memory_diff:+.2f}"
        else:
            parts = []
            if runtime_diff is not None:
                parts.append(f"R:{runtime_diff:+.2f}")
            if memory_diff is not None:
                parts.append(f"M:{memory_diff:+.2f}")
            return ' '.join(parts) if parts else 'N/A'