import os

# Файлы с какими расширениями мы собираем
ALLOWED_EXTENSIONS = {'.py', '.js', '.html', '.css', '.json'}
# Какие папки игнорируем, чтобы не засорять контекст
IGNORE_DIRS = {
    '.venv',
    '__pycache__',
    '.vscode',
    '.git',
    '.continue',
    '.test-artifacts',
    '.integration-test-artifacts',
    'browser_profiles',
    'docs',
    'node_modules',
    'ui-dist',
}

with open('project_context.txt', 'w', encoding='utf-8') as outfile:
    for root, dirs, files in os.walk('.'):
        # Исключаем ненужные директории
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        
        for file in files:
            ext = os.path.splitext(file)[1]
            if ext in ALLOWED_EXTENSIONS and file != 'collect_code.py':
                filepath = os.path.join(root, file)
                outfile.write(f"\n{'='*50}\n")
                outfile.write(f"ФАЙЛ: {filepath}\n")
                outfile.write(f"{'='*50}\n\n")
                try:
                    with open(filepath, 'r', encoding='utf-8') as infile:
                        outfile.write(infile.read())
                except Exception as e:
                    outfile.write(f"Ошибка чтения: {e}\n")
                    
print("Готово! Файл project_context.txt создан в корне проекта.")
