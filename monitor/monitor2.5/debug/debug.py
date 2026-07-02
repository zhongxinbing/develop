

def red (*args):
    print(f'\033[1;31m{" ".join(str(arg) for arg in args)}\033[0m')

def green (*args):
    print(f'\033[1;32m{" ".join(str(arg) for arg in args)}\033[0m')

def blue (*args):
    print(f'\033[1;34m{" ".join(str(arg) for arg in args)}\033[0m')