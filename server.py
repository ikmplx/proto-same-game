"""Запуск локального сервера игры без дополнительных библиотек."""
import functools
import http.server
import sys
import webbrowser
from pathlib import Path


def main():
    directory = Path(__file__).resolve().parent
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    try:
        with http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler) as server:
            address = f'http://127.0.0.1:{server.server_port}/'
            print(f'Игра запущена: {address}', flush=True)
            print('Оставьте это окно открытым во время игры. Чтобы остановить сервер, закройте окно.', flush=True)
            if '--no-browser' not in sys.argv:
                if not webbrowser.open(address):
                    print('Не удалось открыть браузер автоматически. Откройте адрес выше вручную.', flush=True)
            server.serve_forever()
    except KeyboardInterrupt:
        print('\nИгра остановлена.', flush=True)
    except OSError as error:
        print(f'Не удалось запустить сервер: {error}', flush=True)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
