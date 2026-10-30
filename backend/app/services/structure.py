from functools import lru_cache

from fastapi import HTTPException
from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors, rdMolDescriptors
from rdkit.Chem.Draw import rdMolDraw2D

from app.models.tables import Drug

RDLogger.DisableLog("rdApp.*")

SVG_SIZE = (420, 320)


# Dark bonds on a transparent background; the dark theme inverts the image in CSS.
def draw_svg(mol, size=SVG_SIZE):
    drawer = rdMolDraw2D.MolDraw2DSVG(*size)
    options = drawer.drawOptions()
    options.clearBackground = False
    options.bondLineWidth = 2
    drawer.DrawMolecule(mol)
    drawer.FinishDrawing()
    return drawer.GetDrawingText()


@lru_cache(maxsize=2048)
def thumbnail_svg(smiles, size=(180, 130)):
    mol = Chem.MolFromSmiles(smiles) if smiles else None
    return draw_svg(mol, size) if mol else None


# The 3D model is built offline by ml/pipelines/conformers.py: embedding can take seconds per molecule.
def drug_structure(db, drug_id):
    drug = db.get(Drug, drug_id)
    mol = Chem.MolFromSmiles(drug.smiles) if drug and drug.smiles else None
    if mol is None:
        raise HTTPException(status_code=404, detail={"error": "structure_not_found", "detail": drug_id})
    return {
        "id": drug.drug_id,
        "name": drug.name,
        "drugbank_id": drug.drugbank_id,
        "pubchem_cid": drug.pubchem_cid,
        "smiles": drug.smiles,
        "formula": rdMolDescriptors.CalcMolFormula(mol),
        "molecular_weight": round(Descriptors.MolWt(mol), 2),
        "heavy_atoms": mol.GetNumHeavyAtoms(),
        "svg": draw_svg(mol),
        "molblock": drug.molblock,
        "note_3d": drug.conformer_note,
    }
