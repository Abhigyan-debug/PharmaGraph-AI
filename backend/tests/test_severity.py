from app.services.severity import is_contraindicated


def test_contraindication_labels_from_each_source():
    assert is_contraindicated("DDInter: Major; FrenchDB: CI")
    assert is_contraindicated("KEGG: CI,P")
    assert is_contraindicated("Kegg: CI; OSCAR: 2")
    assert is_contraindicated("World-Vista: contraindication")


def test_major_is_not_contraindicated():
    assert not is_contraindicated("DDInter: Major; KEGG: P; NDF-RT: critical")


def test_no_record():
    assert not is_contraindicated(None)
    assert not is_contraindicated("")


def test_label_must_match_exactly():
    assert not is_contraindicated("OSCAR: CI")
    assert not is_contraindicated("World-Vista: not recommended")
