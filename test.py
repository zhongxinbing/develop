

dict1 = {"a": {"b": [1], "c": 2}}
dict2 = {"a": {"b": [3], "d": 4}}



def deep_merge(dict1, dict2):
    """递归合并两个字典"""
    result = dict1.copy()
    for key, value in dict2.items():
        if key in result:
            if isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = deep_merge(result[key], value)
            elif isinstance(result[key], list) and isinstance(value, list):
                # 合并列表并去重（保持顺序）
                result[key] = list(dict.fromkeys(result[key] + value))
            else:
                result[key] = value
        else:
            result[key] = value
    return result


print(deep_merge(dict1, dict2))
# 输出: {'a': {'b': 3, 'c': 2, 'd': 4}}