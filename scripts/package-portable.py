"""Package the generated HTML for download, using only Python's standard library."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
html = root / "releases" / "Lume.html"
if not html.is_file():
    raise SystemExit("Gere o HTML antes: npm run build:portable")

archive = html.with_name("Lume-portatil.zip")
instructions = """LUME — ESTÚDIO DE IMAGENS

1. Extraia todos os arquivos deste ZIP para uma pasta no computador.
2. Clique com o botão direito em Lume.html.
3. Selecione Abrir com > Google Chrome ou Microsoft Edge.

Não é necessário instalar Node.js, usar o terminal ou manter conexão com a internet.
Use Importar imagem para começar, ou experimente o documento de demonstração.
Salve uma cópia do seu trabalho em Arquivo > Salvar projeto (.lume).

Se aparecer código de programação, abra o arquivo no navegador, não no editor de texto.
Este pacote contém o editor completo em um único HTML, não um instalador executável.
"""
with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=9) as bundle:
    bundle.write(html, "Lume.html")
    bundle.writestr("LEIA-ME.txt", instructions)

with ZipFile(archive) as bundle:
    if bundle.testzip() is not None:
        raise SystemExit("Falha na verificação do ZIP.")
print(f"Pacote criado e verificado: {archive}")
