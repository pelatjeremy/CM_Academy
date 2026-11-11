"""Contrôle des PDF fictifs de recette ; aucune connexion à la base locale."""
import argparse
import json
from pathlib import Path
import pdfplumber

parser = argparse.ArgumentParser()
parser.add_argument('dossier')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1] / '.catalogue-test'
folder = Path(args.dossier).resolve()
assert root.resolve() in folder.parents, 'Dossier de test isolé requis'
scenario = json.loads((folder / 'scenario.json').read_text(encoding='utf-8'))
results = []
for name, draft in [('attestation-brouillon.pdf', True), ('attestation-stagiaire.pdf', False)]:
    with pdfplumber.open(folder / name) as pdf:
        texts = [page.extract_text() or '' for page in pdf.pages]
        # Les retours à la ligne de mise en page ne changent pas le contenu.
        text = ' '.join('\n'.join(texts).split())
        for i, page in enumerate(pdf.pages):
            assert abs(page.width - 595.28) < 1 and abs(page.height - 841.89) < 1
            assert f'Page {i + 1} / {len(pdf.pages)}' in texts[i]
            if draft:
                assert 'BROUILLON' in texts[i]
        for expected in ['Éléonore Recette', 'CMH Recette', 'Observer et accompagner le cheval',
                         '14 h 00 min', '12 h 00 min', 'participation partielle',
                         'Europe/Paris', 'manuellement', 'Objectifs pédagogiques']:
            assert expected in text, f'Contenu manquant : {expected}'
        for forbidden in ['Note interne', 'Financeur fictif', 'noe@recette.invalid',
                          'eleonore@recette.invalid', 'Mieux observer le cheval']:
            assert forbidden not in text, 'Contenu privé non destiné au PDF'
        if not draft:
            assert scenario['reference'] in text and 'BROUILLON' not in text
        assert scenario['dureeProgrammeeMs'] == 840 * 60000
        assert scenario['dureeRenseigneeMs'] == 720 * 60000
        results.append({'pdf': name, 'pages': len(pdf.pages), 'A4': True,
                        'identiteFormationOrganisme': True, 'durees': True,
                        'paginationAccents': True, 'confidentialite': True})
(folder / 'pdf-results.json').write_text(json.dumps({'success': True, 'results': results},
                                                  ensure_ascii=False, indent=2), encoding='utf-8')
print('PASS contenu, durées, référence, confidentialité, A4, accents et pagination des deux PDF')
