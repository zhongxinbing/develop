export async function loadSingleThreadData(pathOrId) {
  // 这里是你可以替换的单线程数据加载函数。
  // 参数为工具配置中的单线程数据路径。
  // 返回值格式示例：
  // {
  //   "caseA": {
  //     "casename_key": "caseA",
  //     "daily_metrics_key": {
  //       "2026-06-01": {
  //         "Overall": { runtime: 20.1, memory: 30.1 }
  //       }
  //     }
  //   }
  // }
  return {
    example_case: {
      casename_key: 'example_case',
      daily_metrics_key: {
        '2026-05-20': { Overall: { runtime: 26.1, memory: 42.7 } },
        '2026-05-21': { Overall: { runtime: 24.3, memory: 40.2 } },
        '2026-05-22': { Overall: { runtime: 22.8, memory: 39.4 } }
      }
    }
  };
}

export async function loadMultiThreadData(pathOrId) {
  // 这里是你可以替换的多线程数据加载函数。
  // 返回值格式示例：
  // {
  //   "caseA": {
  //     "casename_key": "caseA",
  //     "daily_metrics_key": {
  //       "2026-06-01": {
  //         "Overall": {
  //           thread_metrics: {
  //             "2": { runtime: 20.1, memory: 30.1 }
  //           }
  //         }
  //       }
  //     }
  //   }
  // }
  return {
    multi_case: {
      casename_key: 'multi_case',
      daily_metrics_key: {
        '2026-05-20': { Overall: { thread_metrics: { '4': { runtime: 41.8, memory: 78.5 } } } },
        '2026-05-21': { Overall: { thread_metrics: { '4': { runtime: 39.7, memory: 75.1 } } } },
        '2026-05-22': { Overall: { thread_metrics: { '4': { runtime: 38.2, memory: 74.6 } } } }
      }
    }
  };
}

export async function loadCustomCurveData(pathOrId) {
  // 这里是自定义曲线数据获取函数占位。
  return {
    custom_curve: {
      casename_key: 'custom_curve',
      daily_metrics_key: {
        '2026-05-20': { CustomRule: { runtime: 31.2, memory: 29.9 } },
        '2026-05-21': { CustomRule: { runtime: 29.5, memory: 27.8 } }
      }
    }
  };
}
