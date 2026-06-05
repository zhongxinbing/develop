import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ToolConfig, ToolConfigRecord, ExtraTag } from '../types';
import { generateId, normalizeToolConfig } from '../utils';
import { saveTool } from '../api';

type Props = {
  tools: ToolConfigRecord;
  setTools: (tools: ToolConfigRecord) => void;
  userId: string;
};

const emptyConfig: ToolConfig = {
  id: '',
  name: '',
  description: '',
  singleThreadPath: '',
  multiThreadPath: '',
  extraTags: [],
  fetchSingleFunc: '',
  fetchMultiFunc: '',
  customCurveFunc: ''
};

export default function ConfigPage({ tools, setTools, userId }: Props) {
  const [config, setConfig] = useState<ToolConfig>(emptyConfig);
  const [isEditing, setIsEditing] = useState(false);
  const navigate = useNavigate();

  const entries = useMemo(() => Object.values(tools), [tools]);

  const handleChange = (key: keyof ToolConfig, value: string | ExtraTag[]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const addTag = () => {
    setConfig((prev) => ({ ...prev, extraTags: [...prev.extraTags, { name: '', value: '' }] }));
    setIsEditing(true);
  };

  const updateTag = (index: number, key: keyof ExtraTag, value: string) => {
    setConfig((prev) => {
      const tags = [...prev.extraTags];
      tags[index] = { ...tags[index], [key]: value };
      return { ...prev, extraTags: tags };
    });
  };

  const removeTag = (index: number) => {
    setConfig((prev) => ({ ...prev, extraTags: prev.extraTags.filter((_, idx) => idx !== index) }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const toolId = config.id || generateId('tool');
    const payload = normalizeToolConfig({ ...config, id: toolId });
    const saved = await saveTool(userId, payload);
    setTools({ ...tools, [saved.id]: saved });
    navigate(`/tool/${saved.id}`);
  };

  return (
    <div className="card-grid">
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">配置工具</h2>
            <p>查看已配置的工具信息，或添加新的 EDA QOR 工具。</p>
          </div>
        </div>
        {entries.length === 0 ? (
          <p>当前没有已配置的工具。</p>
        ) : (
          <div className="tool-list">
            {entries.map((tool) => (
              <div key={tool.id} className="card">
                <p><strong>{tool.name}</strong></p>
                <p>{tool.description}</p>
                <button className="tool-button" onClick={() => navigate(`/tool/${tool.id}`)}>进入工具页面</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">新增工具</h2>
          <button className="secondary-button" onClick={addTag}>添加额外显示字段</button>
        </div>
        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>工具名称</label>
            <input value={config.name} onChange={(e) => handleChange('name', e.target.value)} required />
          </div>
          <div className="form-row">
            <label>工具描述</label>
            <textarea value={config.description} onChange={(e) => handleChange('description', e.target.value)} required />
          </div>
          <div className="form-row">
            <label>单线程数据路径</label>
            <input value={config.singleThreadPath} onChange={(e) => handleChange('singleThreadPath', e.target.value)} required />
          </div>
          <div className="form-row">
            <label>多线程数据路径（可选）</label>
            <input value={config.multiThreadPath} onChange={(e) => handleChange('multiThreadPath', e.target.value)} />
          </div>
          <div className="form-row">
            <label>调用单线程接口函数</label>
            <input value={config.fetchSingleFunc} onChange={(e) => handleChange('fetchSingleFunc', e.target.value)} placeholder="例如 loadSingleThreadData" required />
          </div>
          <div className="form-row">
            <label>调用多线程接口函数（可选）</label>
            <input value={config.fetchMultiFunc} onChange={(e) => handleChange('fetchMultiFunc', e.target.value)} placeholder="例如 loadMultiThreadData" />
          </div>
          <div className="form-row">
            <label>自定义曲线获取接口函数（可选）</label>
            <input value={config.customCurveFunc} onChange={(e) => handleChange('customCurveFunc', e.target.value)} placeholder="例如 loadCustomCurveData" />
          </div>

          {config.extraTags.length > 0 && (
            <div className="card">
              <h3 className="card-title">额外显示字段</h3>
              <div className="form-grid">
                {config.extraTags.map((tag, index) => (
                  <div key={index} className="split-grid">
                    <div className="form-row">
                      <label>字段名称</label>
                      <input value={tag.name} onChange={(e) => updateTag(index, 'name', e.target.value)} required />
                    </div>
                    <div className="form-row">
                      <label>字段值</label>
                      <input value={tag.value} onChange={(e) => updateTag(index, 'value', e.target.value)} required />
                    </div>
                    <button type="button" className="secondary-button" onClick={() => removeTag(index)}>删除</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="action-button" type="submit">保存并进入工具页面</button>
        </form>
      </div>
    </div>
  );
}
