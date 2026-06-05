import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ToolConfigRecord } from '../types';

type Props = {
  tools: ToolConfigRecord;
  userId: string;
};

export default function HomePage({ tools }: Props) {
  const navigate = useNavigate();
  const toolEntries = useMemo(() => Object.values(tools), [tools]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="card-grid">
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">工具总览</h2>
            <p>当前已配置工具数量：{toolEntries.length}</p>
          </div>
          <div className="badge">{toolEntries.length}</div>
        </div>

        <div className="tool-list">
          {toolEntries.map((tool) => (
            <button
              key={tool.id}
              className="tool-button"
              onClick={() => navigate(`/tool/${tool.id}`)}
              onMouseEnter={() => setHoveredId(tool.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {tool.name}
            </button>
          ))}
        </div>
      </div>

      {hoveredId && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">当前工具信息</h2>
          </div>
          {tools[hoveredId] ? (
            <div>
              <p><strong>名称：</strong>{tools[hoveredId].name}</p>
              <p><strong>描述：</strong>{tools[hoveredId].description}</p>
              <p><strong>单线程数据路径：</strong>{tools[hoveredId].singleThreadPath}</p>
              <p><strong>多线程数据路径：</strong>{tools[hoveredId].multiThreadPath || '未配置'}</p>
              <div className="small-tag">
                {tools[hoveredId].extraTags.map((tag, index) => (
                  <span key={index}>{tag.name}: {tag.value}</span>
                ))}
              </div>
            </div>
          ) : (
            <p>工具信息不存在。</p>
          )}
        </div>
      )}
    </div>
  );
}
