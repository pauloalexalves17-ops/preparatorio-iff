# Preparatório IFFluminense

Site local para organizar provas dos cursos técnicos integrados e concomitantes do IFFluminense, com questões filtradas por ano, disciplina, gabarito e descritor.

## Abrir o site

Com o servidor local ativo:

```text
http://127.0.0.1:8765/
```

Para desenvolvimento local, prefira o servidor do projeto, que envia cabeçalhos anti-cache:

```powershell
C:\Users\Desktop\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe tools\serve_site.py 8765
```

## Conteúdo carregado

- PDFs de provas, gabaritos e edital em `assets/pdfs/`
- Recortes de figuras das questões em `assets/question-images/`
- Catálogo extraído em `data/catalog.json`
- Resoluções iniciais em `data/resolutions.json`
- Script de reconstrução em `tools/build_site_data.py`

## Regenerar dados

```powershell
C:\Users\Desktop\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe tools\build_site_data.py
```

O script relê a pasta original das provas quando ela estiver acessível; caso contrário, usa os PDFs já copiados em `assets/pdfs/`. Ele mantém textos legíveis digitados, recorta apenas elementos visuais reais do PDF e atualiza o catálogo. Os gabaritos finais embutidos nas provas têm prioridade sobre gabaritos preliminares.
