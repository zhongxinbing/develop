from datetime import datetime

def log(str):
    print(f"{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}: {str}")