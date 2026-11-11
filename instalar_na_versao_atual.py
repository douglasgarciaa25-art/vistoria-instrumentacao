#!/usr/bin/env python3
"""Aplica o módulo Google Drive ao código mais recente do Vistoria Técnica.
Execução: python instalar_na_versao_atual.py /caminho/do/repositorio
Não substitui nem remove funcionalidades ou arquivos existentes.
"""
from pathlib import Path
import shutil
import sys


def instalar(repo: Path):
    repo = repo.resolve()
    entrada = repo / "index.html"
    modulo_origem = Path(__file__).resolve().parent / "google-drive-sync.js"
    modulo_destino = repo / modulo_origem.name
    if not entrada.is_file():
        raise SystemExit(f"ERRO: index.html não encontrado em {repo}")
    if not modulo_origem.is_file():
        raise SystemExit("ERRO: google-drive-sync.js não encontrado junto ao instalador")
    html = entrada.read_text(encoding="utf-8")
    if "</body>" not in html.lower():
        raise SystemExit("ERRO: HTML sem </body>. Nenhum arquivo foi alterado.")
    if "id=\"cloudKey\"" not in html and "id='cloudKey'" not in html:
        print("ATENÇÃO: cloudKey não encontrado. Confira se a versão usa a tela de nuvem habitual.")
    if "history.js" not in html:
        raise SystemExit("ERRO: history.js não encontrado. Este módulo exige a versão com histórico das vistorias.")
    if "google-drive-sync.js" not in html:
        marker = '<script src="/google-drive-sync.js?v=20261110"></script>'
        idx = html.lower().rfind("</body>")
        html = html[:idx] + marker + "\n" + html[idx:]
        bkp = repo / "index.html.antes-google-drive.bak"
        if not bkp.exists():
            shutil.copy2(entrada, bkp)
        entrada.write_text(html, encoding="utf-8")
        print("OK: index.html atualizado sem alterar os scripts atuais.")
    else:
        print("OK: index.html já contém google-drive-sync.js; sem duplicação.")
    shutil.copy2(modulo_origem, modulo_destino)
    print("OK: google-drive-sync.js copiado.")
    print("Próximo passo: configurar seu ID OAuth na tela Google Drive do aplicativo publicado.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Uso: python instalar_na_versao_atual.py PASTA_DO_REPOSITORIO")
    instalar(Path(sys.argv[1]))
