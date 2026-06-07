def validate_tool_config(data: dict) -> (bool, str):
    """校验工具配置表单"""
    # 必选字段校验
    must_fields = ["tool_name", "signal_thread_path"]
    for field in must_fields:
        if not data.get(field):
            return False, f"{field} 为必填项"

    # 路径与接口联动校验
    signal_path = data.get("signal_thread_path", "")
    multi_path = data.get("multi_thread_path", "")
    signal_api = data.get("signal_thread_api", False)
    multi_api = data.get("multi_thread_api", False)

    if signal_path and not signal_api:
        return False, "选择单线程数据路径后，必须勾选对应单线程接口函数"
    if multi_path and not multi_api:
        return False, "选择多线程数据路径后，必须勾选对应多线程接口函数"

    return True, "校验通过"