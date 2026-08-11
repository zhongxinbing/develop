import zipfile
import json
import csv
import os
from pathlib import Path

def extract_xmind_content(xmind_file_path):
    """
    从XMind文件中提取内容，支持多种XMind版本
    """
    try:
        with zipfile.ZipFile(xmind_file_path, 'r') as zip_ref:
            # 列出所有文件，用于调试
            all_files = zip_ref.namelist()
            print(f"📁 XMind文件包含的文件: {all_files}")
            
            # 尝试不同的JSON文件
            possible_json_files = ['content.json', 'content.xml', 'meta.json']
            for json_file in possible_json_files:
                if json_file in all_files:
                    print(f"📄 找到文件: {json_file}")
                    content = zip_ref.read(json_file)
                    if json_file.endswith('.json'):
                        return json.loads(content.decode('utf-8'))
                    elif json_file.endswith('.xml'):
                        # 如果是XML格式，需要特殊处理
                        print("⚠️ 检测到XML格式，请安装xmltodict: pip install xmltodict")
                        return None
            
            raise Exception("未找到内容文件，请检查XMind文件格式")
            
    except Exception as e:
        raise Exception(f"读取XMind文件失败: {str(e)}")

def extract_topics_from_json(data):
    """
    从JSON数据中提取所有主题，支持多种数据结构
    """
    topics = []
    
    print(f"🔍 数据根节点类型: {type(data)}")
    if isinstance(data, list):
        print(f"📊 列表长度: {len(data)}")
        if len(data) > 0:
            print(f"📊 第一个元素类型: {type(data[0])}")
            data = data[0]
    elif isinstance(data, dict):
        print(f"📊 字典键: {list(data.keys())}")
    
    def get_topic_title(topic):
        """获取主题标题，支持多种字段名"""
        title = topic.get('title')
        if not title:
            title = topic.get('text')
        if not title:
            title = topic.get('label')
        if not title:
            title = topic.get('name')
        if not title:
            title = f"未命名主题 (ID: {topic.get('id', 'unknown')})"
        return title
    
    def get_topic_children(topic):
        """获取子主题，支持多种结构"""
        # 方法1: 标准XMind结构
        children = topic.get('children', {})
        if isinstance(children, dict):
            # 尝试获取 'attached' 或其他键
            for key in ['attached', 'children', 'topics', 'subtopics']:
                if key in children:
                    child_list = children[key]
                    if isinstance(child_list, list):
                        return child_list
            # 如果children是列表
            if isinstance(children, list):
                return children
        
        # 方法2: 直接在topic下的children
        children = topic.get('children', [])
        if isinstance(children, list):
            return children
        
        # 方法3: 扁平结构
        children = topic.get('topics', [])
        if isinstance(children, list):
            return children
        
        # 方法4: 其他可能的键
        for key in ['subtopics', 'childTopics', 'subTopics']:
            children = topic.get(key, [])
            if isinstance(children, list):
                return children
        
        return []
    
    def traverse_topic(topic, level=0, parent_path=""):
        """递归遍历主题树"""
        if not topic:
            return
        
        # 如果是列表，遍历每个元素
        if isinstance(topic, list):
            for item in topic:
                traverse_topic(item, level, parent_path)
            return
        
        # 如果不是字典，跳过
        if not isinstance(topic, dict):
            print(f"⚠️ 跳过非字典类型: {type(topic)}")
            return
        
        # 获取标题
        title = get_topic_title(topic)
        
        # 构建路径
        if parent_path:
            current_path = f"{parent_path} / {title}"
        else:
            current_path = title
        
        # 添加到主题列表
        topics.append({
            'level': level,
            'title': title,
            'full_path': current_path,
            'parent_path': parent_path,
            'topic_data': topic
        })
        
        # 获取子主题
        children = get_topic_children(topic)
        if children:
            print(f"🔽 主题 '{title}' 有 {len(children)} 个子主题")
            for child in children:
                traverse_topic(child, level + 1, current_path)
    
    # 开始遍历
    print("🔄 开始遍历主题树...")
    
    # 如果data有'rootTopic'键，从根主题开始
    if isinstance(data, dict) and 'rootTopic' in data:
        print("🌳 找到根主题 (rootTopic)")
        traverse_topic(data['rootTopic'])
    else:
        # 否则直接遍历
        traverse_topic(data)
    
    print(f"✅ 遍历完成，共找到 {len(topics)} 个主题")
    return topics

def topics_to_structured_data(topics):
    """
    将主题列表转换为结构化的数据
    """
    if not topics:
        return []
    
    structured_rows = []
    for topic in topics:
        row = {
            'level': topic['level'],
            'title': topic['title'],
            'full_path': topic['full_path']
        }
        
        # 为不同层级创建列
        path_parts = topic['full_path'].split(' / ')
        for i, part in enumerate(path_parts):
            row[f'level_{i+1}'] = part
        
        structured_rows.append(row)
    
    return structured_rows

def write_to_csv(structured_rows, csv_file_path):
    """
    将结构化数据写入CSV文件
    """
    if not structured_rows:
        print("没有数据可写入CSV")
        return
    
    # 确保输出目录存在
    output_dir = os.path.dirname(csv_file_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    # 确定CSV字段
    fieldnames = ['level', 'title', 'full_path']
    all_levels = set()
    for row in structured_rows:
        for key in row.keys():
            if key.startswith('level_'):
                all_levels.add(key)
    
    # 按层级排序
    sorted_levels = sorted(all_levels, key=lambda x: int(x.split('_')[1]))
    fieldnames.extend(sorted_levels)
    
    try:
        with open(csv_file_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            
            for row in structured_rows:
                complete_row = {field: '' for field in fieldnames}
                complete_row.update(row)
                writer.writerow(complete_row)
        
        print(f"✅ CSV文件已成功保存到: {csv_file_path}")
        print(f"📊 共写入 {len(structured_rows)} 行数据")
        print(f"📋 包含列: {', '.join(fieldnames)}")
        
    except Exception as e:
        raise Exception(f"写入CSV文件失败: {str(e)}")

def debug_xmind_structure(xmind_file_path):
    """
    调试函数：打印XMind文件的结构
    """
    try:
        print("🔍 ===== 开始调试XMind文件结构 =====")
        
        with zipfile.ZipFile(xmind_file_path, 'r') as zip_ref:
            all_files = zip_ref.namelist()
            print(f"📁 文件列表: {all_files}")
            
            for file_name in all_files:
                if file_name.endswith('.json'):
                    print(f"\n📄 文件: {file_name}")
                    content = zip_ref.read(file_name)
                    try:
                        data = json.loads(content.decode('utf-8'))
                        print(f"📊 数据结构: {type(data)}")
                        if isinstance(data, list):
                            print(f"📊 列表长度: {len(data)}")
                            if len(data) > 0:
                                print(f"📊 第一个元素类型: {type(data[0])}")
                                if isinstance(data[0], dict):
                                    print(f"📊 键: {list(data[0].keys())[:10]}...")
                        elif isinstance(data, dict):
                            print(f"📊 键: {list(data.keys())[:10]}...")
                    except Exception as e:
                        print(f"❌ 解析失败: {e}")
        
        print("🔍 ===== 调试完成 =====")
        
    except Exception as e:
        print(f"❌ 调试失败: {str(e)}")

def xmind_to_csv(xmind_file_path, csv_file_path=None, debug=False):
    """
    将XMind文件转换为CSV的主函数
    """
    if not os.path.exists(xmind_file_path):
        raise FileNotFoundError(f"找不到文件: {xmind_file_path}")
    
    # 如果启用调试模式，先打印结构
    if debug:
        debug_xmind_structure(xmind_file_path)
        return
    
    # 智能解析输出路径
    if not csv_file_path:
        input_path = Path(xmind_file_path)
        csv_file_path = str(input_path.with_suffix('.csv'))
    elif os.path.isdir(csv_file_path) or (not csv_file_path.lower().endswith('.csv')):
        # 如果是目录或没有.csv扩展名
        input_path = Path(xmind_file_path)
        csv_filename = input_path.stem + '.csv'
        csv_file_path = os.path.join(csv_file_path, csv_filename)
    
    print(f"📁 输入文件: {xmind_file_path}")
    print(f"📁 输出文件: {csv_file_path}")
    print("-" * 60)
    
    try:
        print("📖 正在读取XMind文件...")
        data = extract_xmind_content(xmind_file_path)
        
        if not data:
            print("❌ 无法解析XMind文件内容")
            return
        
        print("🔍 正在解析主题结构...")
        topics = extract_topics_from_json(data)
        
        if not topics:
            print("❌ 未找到任何主题内容")
            print("💡 提示: 可以使用 debug=True 参数查看文件结构")
            return
        
        print(f"✅ 发现 {len(topics)} 个主题")
        
        print("📊 正在生成结构化数据...")
        structured_rows = topics_to_structured_data(topics)
        
        print("💾 正在写入CSV文件...")
        write_to_csv(structured_rows, csv_file_path)
        
        print("✅ 转换完成!")
        
    except Exception as e:
        print(f"❌ 转换失败: {str(e)}")
        raise

def main():
    """
    主函数
    """
    print("=" * 60)
    print("XMind to CSV 转换工具 v2.0")
    print("=" * 60)
    print()
    
    while True:
        xmind_path = input("请输入XMind文件路径 (输入 'exit' 退出): ").strip()
        
        if xmind_path.lower() == 'exit':
            print("程序退出")
            break
        
        if not xmind_path:
            print("❌ 请输入有效的文件路径")
            continue
        
        xmind_path = xmind_path.strip('"').strip("'")
        
        if not os.path.exists(xmind_path):
            print(f"❌ 找不到文件: {xmind_path}")
            continue
        
        try:
            print("\n🔧 选项:")
            print("  1. 正常转换")
            print("  2. 调试模式 (查看文件结构)")
            choice = input("请选择 (1/2): ").strip()
            
            if choice == '2':
                print("\n🔍 进入调试模式...")
                debug_xmind_structure(xmind_path)
                continue
            
            csv_path = input("\n请输入CSV文件保存路径 (直接回车将自动生成): ").strip()
            if not csv_path:
                csv_path = None
            
            print("\n开始转换...")
            print("-" * 60)
            
            xmind_to_csv(xmind_path, csv_path)
            
        except Exception as e:
            print(f"❌ 发生错误: {str(e)}")
        
        print()
        print("-" * 60)
        continue_choice = input("\n是否继续转换其他文件? (y/n): ").strip().lower()
        if continue_choice != 'y':
            print("程序结束")
            break

if __name__ == "__main__":
    main()