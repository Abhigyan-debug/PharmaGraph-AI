CONTRAINDICATION_LABELS = {
    "FrenchDB: CI",
    "KEGG: CI",
    "KEGG: CI,P",
    "Kegg: CI",
    "World-Vista: contraindication",
}


def is_contraindicated(severity_raw):
    if not severity_raw:
        return False
    return any(label in CONTRAINDICATION_LABELS for label in severity_raw.split("; "))
