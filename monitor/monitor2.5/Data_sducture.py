from matplotlib import dates
from streamlit import metric


paserer = {
    'single_multi': {
        'casename': {
            'rulename1': {
                'thread1': {
                    'dates': [],
                    'datas': [],
                    'crash_dates':[]
                },
                'thread2': {
                    'dates': [],
                    'datas': [],
                    'crash_dates':[]
                }
            },
            'rulename2': {
                'thread1': {
                    'dates': [],
                    'datas': [],
                    'crash_dates':[]

                },
                'thread2': {
                    'dates': [],
                    'datas': [],
                    'crash_dates':[]
                }
            }
        }
    }
}


data = {
    'casename': {
        'casename': 'casename',
        'metrics': [],
        'threads': [],
        'dates': [],
        'rules_data': {
            'rulename1': {
                'dates': {
                    'thread1': [],
                    'thread2': []
                }
            },
            'rulename2': {
                'dates': {
                    'thread1': [],
                    'thread2': []
                }
            },
        }
    }
}