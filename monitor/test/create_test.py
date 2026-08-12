import csv
import random
import string
from pathlib import Path
from datetime import datetime, timedelta

# 路径定义
base = Path(r"E:\git\develop\monitor\test")
multi = base / "multi"
single = base / "single"
signal = base / "signal"

# 日期范围（可调整）
start_date = datetime(2026, 5, 1, 6, 0)
end_date = datetime(2026, 5, 2, 6, 0)

# 线程列表
threads = [2, 4, 6, 8, 16, 32, 64, 128]


def random_string(length=10):
    return ''.join(random.choices(string.ascii_lowercase, k=length))


# ============================================================
# 1. 生成多线程测试文件: multi/YYYY-MM-DD-HH/multi/case/thread_N/{aes,pcie}/elint.log
# ============================================================
def generate_multi():
    print("[multi] 生成多线程测试文件...")
    d = start_date
    while d <= end_date:
        date_str = d.strftime("%Y-%m-%d-%H")
        for thread in threads:
            for module in range(0,100):
                log_dir = base / date_str / "case" / f"{module:03d}_thread_{thread:03d}" 
                log_dir.mkdir(parents=True, exist_ok=True)
                log_file = log_dir / "elint.log"
                with open(log_file, "w", encoding="utf-8") as f:
                    f.write(f"# ELINT log for thread_{thread} / {module}\n")
                    f.write(f"# Generated: {d.isoformat()}\n")
                    for i in range(10000):
                        ts = d + timedelta(minutes=i * 3)
                        level = random.choice(["INFO", "WARN", "ERROR", "DEBUG"])
                        f.write(f"{ts.strftime('%Y-%m-%d %H:%M:%S')} Checking lint rule E{i:04d} CpuTime({round(random.uniform(0, 100), 2)}s); RealTime({round(random.uniform(0, 100), 2)}s); PeakMem({round(random.uniform(0, 100), 2)}M); IncMem({round(random.uniform(0, 100), 2)}M); RealTimeIncMem({round(random.uniform(-100, 100), 2)}M)\n")
                    overall= f" \
+--------------+-----------------------+-----------------------+------------------+-------------+------------+------------+\n \
| Command      | Elapse Time (H:M:S)   | CPU Time (H:M:S)      | Peak Memory (MB) | ERROR Count | WARN Count | INFO Count |\n \
+--------------+-----------------------+-----------------------+------------------+-------------+------------+------------+\n \
| read_design  | {random.randint(0, 100)} mins : {round(random.uniform(0, 100), 3)} secs  | {random.randint(0, 100)} mins : {round(random.uniform(0, 100), 3)} secs  | {round(random.uniform(1000, 100000), 3)}        | 12          | 4          | 1          |\n \
+--------------+-----------------------+-----------------------+------------------+-------------+------------+------------+\n \
| check_lint   | {random.randint(0, 100)} mins : {round(random.uniform(0, 100), 3)} secs  | {random.randint(0, 100)}  mins : {round(random.uniform(0, 100), 3)} secs | {round(random.uniform(1000, 100000), 3)}        | 72826       | 268778     | 76282      |\n \
+--------------+-----------------------+-----------------------+------------------+-------------+------------+------------+\n \
| save_session | {random.randint(0, 100)} mins : {round(random.uniform(0, 100), 3)} secs  | {random.randint(0, 100)}  mins : {round(random.uniform(0, 100), 3)} secs | {round(random.uniform(1000, 100000), 3)}        | 0           | 0          | 0          |\n \
+--------------+-----------------------+-----------------------+------------------+-------------+------------+------------+\n \
| Overall      | {random.randint(0, 100)} mins : {round(random.uniform(0, 100), 3)} secs  | {random.randint(0, 100)}  mins : {round(random.uniform(0, 100), 3)} secs | {round(random.uniform(1000, 100000), 3)}        | 72838       | 268782     | 76283      |\n \
+--------------+-----------------------+-----------------------+------------------+-------------+------------+------------+\n \
"
                    f.write(overall)

        d += timedelta(days=1)
    count = (end_date - start_date).days + 1
    print(f"[multi] 完成，共生成 {count * len(threads) * 2} 个文件")


# ============================================================
# 2. 生成单线程测试文件: single/YYYY-MM-DD-HH/case/thread_1/{aes,pcie}/elint.log
# ============================================================
def generate_single():
    print("[single] 生成单线程测试文件...")
    d = start_date
    while d <= end_date:
        date_str = d.strftime("%Y-%m-%d-%H")
        for module in range(0,100):
            log_dir = base / date_str / "case" / f"{module:03d}" 
            log_dir.mkdir(parents=True, exist_ok=True)
            log_file = log_dir / f"{d.strftime('%Y%m%d')}_{module:03d}.txt"
            with open(log_file, "w", encoding="utf-8") as f:
                f.write(f"# ELINT log for thread_1 / {module}\n")
                f.write(f"# Generated: {d.isoformat()}\n")
                for i in range(300):
                    ts = d + timedelta(minutes=i * 3)
                    f.write(f"dict set {d.strftime('%Y%m%d')} E{i:04d} {{{round(random.uniform(0, 100), 2)} {round(random.uniform(0, 100), 2)} {round(random.uniform(0, 100), 2)} {round(random.uniform(0, 1000), 2)} {round(random.uniform(-100, 1000), 3)}}}\n")
                f.write(f"dict set {d.strftime('%Y%m%d')} Overall {{{round(random.uniform(0, 100), 2)} {round(random.uniform(0, 100), 2)} {round(random.uniform(0, 100), 2)} NA NA}}\n")
                f.write(f"dict set {d.strftime('%Y%m%d')} check_lint {{{round(random.uniform(0, 100), 2)} {round(random.uniform(0, 100), 2)} {round(random.uniform(0, 100), 2)} NA NA}}\n")
                f.write(f"dict set {d.strftime('%Y%m%d')} read_design {{{round(random.uniform(0, 100), 2)} {round(random.uniform(0, 100), 2)} {round(random.uniform(0, 100), 2)} NA NA}}\n")
                
        d += timedelta(days=1)
    count = (end_date - start_date).days + 1
    print(f"[single] 完成，共生成 {count * 2} 个文件")


# ============================================================
# 3. 生成信号测试文件: signal/YYYY-MM-DD-HH/performance/YYYYMMDD_{aes,nv}.txt
# ============================================================
def generate_signal():
    print("[signal] 生成信号测试文件...")
    d = start_date
    while d <= end_date:
        date_str = d.strftime("%Y-%m-%d-%H")
        ymd = d.strftime("%Y%m%d")
        perf_dir = signal / date_str / "performance"
        perf_dir.mkdir(parents=True, exist_ok=True)

        for name in ["aes", "nv"]:
            txt_file = perf_dir / f"{ymd}_{name}.txt"
            with open(txt_file, "w", encoding="utf-8") as f:
                f.write(f"# Signal test: {ymd}_{name}\n")
                f.write(f"# Generated: {d.isoformat()}\n\n")
                for i in range(50):
                    freq = random.uniform(1.0, 10.0)
                    power = random.uniform(-50, 10)
                    f.write(f"{freq:.4f} GHz\t{power:.2f} dBm\n")
        d += timedelta(days=1)
    count = (end_date - start_date).days + 1
    print(f"[signal] 完成，共生成 {count * 2} 个文件")


# ============================================================
# 4. 生成 lint_cpu.csv 和 lint_mem.csv
# ============================================================
def generate_lint_csv():
    print("[lint] 生成 lint CPU/MEM CSV 文件...")

    # lint_cpu.csv
    with open(base / "lint_cpu.csv", "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "thread", "module", "cpu_usage", "duration_ms"])
        d = start_date
        while d <= end_date:
            date_str = d.strftime("%Y-%m-%d")
            for thread in threads:
                for module in ["aes", "pcie"]:
                    writer.writerow([
                        date_str,
                        f"thread_{thread}",
                        module,
                        f"{random.uniform(10, 95):.2f}",
                        random.randint(100, 5000),
                    ])
            d += timedelta(days=1)

    # lint_mem.csv
    with open(base / "lint_mem.csv", "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "thread", "module", "mem_usage_mb", "peak_mb"])
        d = start_date
        while d <= end_date:
            date_str = d.strftime("%Y-%m-%d")
            for thread in threads:
                for module in ["aes", "pcie"]:
                    writer.writerow([
                        date_str,
                        f"thread_{thread}",
                        module,
                        f"{random.uniform(50, 2048):.2f}",
                        f"{random.uniform(512, 4096):.2f}",
                    ])
            d += timedelta(days=1)

    print("[lint] 完成")


if __name__ == "__main__":
    print("=" * 50)
    print("开始生成测试目录结构...")
    print(f"日期范围: {start_date.strftime('%Y-%m-%d')} ~ {end_date.strftime('%Y-%m-%d')}")
    print(f"线程数: {threads}")
    print("=" * 50)

    generate_multi()
    # generate_single()
    # generate_signal()
    # generate_lint_csv()

    print("=" * 50)
    print("全部完成！")