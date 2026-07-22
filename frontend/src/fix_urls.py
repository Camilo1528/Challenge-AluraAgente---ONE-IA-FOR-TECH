import os
import glob
import re

frontend_dir = r'c:\Users\Camilo\Desktop\PC\Challenge\frontend\src'
target_url = "http://localhost:8000"
env_var = "API_URL"
fallback = "import.meta.env.VITE_API_URL || 'http://localhost:8000'"

for filepath in glob.glob(os.path.join(frontend_dir, '**', '*.jsx'), recursive=True):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if target_url in content:
        # If API_URL is not defined in the file, we add it at the top after imports
        if 'const API_URL =' not in content:
            # Find the last import
            imports = list(re.finditer(r'^import .*;?$', content, flags=re.MULTILINE))
            if imports:
                last_import = imports[-1]
                insert_pos = last_import.end()
                content = content[:insert_pos] + f'\n\nconst API_URL = {fallback};\n' + content[insert_pos:]
            else:
                content = f'const API_URL = {fallback};\n\n' + content

        # Now replace all instances.
        # Cases:
        # 1. `http://localhost:8000/something` -> `${API_URL}/something`
        # 2. 'http://localhost:8000/something' -> `${API_URL}/something`
        
        # Replace template literal uses: `http://localhost:8000/foo` -> `${API_URL}/foo`
        content = content.replace(f'`{target_url}', f'`${{API_URL}}')
        
        # Replace normal string uses: 'http://localhost:8000/foo' -> `${API_URL}/foo`
        content = content.replace(f"'{target_url}", f"`${{API_URL}}")
        content = content.replace(f'"{target_url}', f'`${{API_URL}}')
        
        # Replace any trailing quotes if they were converted to template literals
        # This is tricky because we replaced the START quote but not the END quote.
        # Wait, let's use regex!
        
        content = re.sub(r"['\"]" + re.escape(target_url) + r"(.*?)['\"]", r"`${API_URL}\1`", content)
        
        # Wait, if we use the regex, we shouldn't do the simple replacements.
        # Let's re-read and just use regex!
        pass

# Let's refine the regex logic
for filepath in glob.glob(os.path.join(frontend_dir, '**', '*.jsx'), recursive=True):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    original = content
    
    if target_url in content:
        if 'const API_URL =' not in content:
            imports = list(re.finditer(r'^import .*;?$', content, flags=re.MULTILINE))
            if imports:
                last_import = imports[-1]
                insert_pos = last_import.end()
                content = content[:insert_pos] + f'\n\nconst API_URL = {fallback};\n' + content[insert_pos:]
            else:
                content = f'const API_URL = {fallback};\n\n' + content

        # Replace 'http://localhost:8000...' or "http://localhost:8000..." with `${API_URL}...`
        content = re.sub(r"['\"]" + re.escape(target_url) + r"([^'\"]*)['\"]", r"`${API_URL}\1`", content)
        
        # Replace `http://localhost:8000...` with `${API_URL}...` (template literals that are ALREADY backticks)
        content = re.sub(r"`" + re.escape(target_url) + r"([^`]*)`", r"`${API_URL}\1`", content)
        
        if content != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Updated {filepath}")
