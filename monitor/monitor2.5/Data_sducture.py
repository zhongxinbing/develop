from matplotlib import dates
from streamlit import metric


paserer = {
    'single_multi': {
        'crash_dates':{
            'thread1': [],
        },
        'casename': {
            'rulename1': {
                'thread1': {
                    'dates': [],
                    'datas': []
                },
                'thread2': {
                    'dates': [],
                    'datas': []
                }
            },
            'rulename2': {
                'thread1': {
                    'dates': [],
                    'datas': []

                },
                'thread2': {
                    'dates': [],
                    'datas': []
                }
            }
        }
    },
    'thread':{
        'casename':{
            'cputime': {
                'rule': {
                    'date': {
                        'thread': [],
                        'data':[]
                    }
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