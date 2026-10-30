from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

MIN_DRUGS, MAX_DRUGS = 2, 10
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class DrugOut(BaseModel):
    id: str
    name: str
    summary: str | None = None  # first sentence of the MeSH description, for search results
    matched: str | None = None  # the synonym or brand name that matched, when the drug's own name didn't


class StructureOut(BaseModel):
    id: str
    name: str
    drugbank_id: str | None
    pubchem_cid: str | None
    smiles: str
    formula: str
    molecular_weight: float
    heavy_atoms: int
    svg: str
    molblock: str | None
    note_3d: str | None


class DrugSelection(BaseModel):
    drug_ids: list[str] = Field(examples=[["pg_000472", "pg_000702"]])

    @field_validator("drug_ids")
    @classmethod
    def two_to_ten_distinct(cls, ids):
        ids = list(dict.fromkeys(ids))
        if not MIN_DRUGS <= len(ids) <= MAX_DRUGS:
            raise ValueError(f"select between {MIN_DRUGS} and {MAX_DRUGS} different drugs (got {len(ids)})")
        return ids


class KnownInteractionOut(BaseModel):
    result_type: Literal["known"] = "known"
    interaction_id: str
    pair: tuple[str, str]
    interaction_type: int
    description: str
    severity: str
    contraindicated: bool
    severity_raw: str | None
    severity_sources: str | None
    source: str


class KnownInteractionsResponse(BaseModel):
    drugs: list[DrugOut]
    pairs_checked: int
    interactions: list[KnownInteractionOut]
    pairs_without_record: list[tuple[str, str]]


class Credentials(BaseModel):
    email: str = Field(max_length=254, pattern=EMAIL_PATTERN, examples=["you@example.com"])
    password: str = Field(min_length=12, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, email):
        return email.strip().lower() if isinstance(email, str) else email


class RegisterIn(Credentials):
    # The form's consent box: an account keeps a history of the drugs checked.
    accept_history: Literal[True]


class UserOut(BaseModel):
    email: str
    created_at: datetime


class SavedCheckOut(BaseModel):
    id: int
    created_at: datetime
    drugs: list[DrugOut]


class DrugRow(BaseModel):
    id: str
    name: str
    drugbank_id: str | None
    smiles: str | None
    has_3d: bool
    interactions: int
    thumbnail: str | None


class DrugPage(BaseModel):
    total: int
    page: int
    page_size: int
    drugs: list[DrugRow]


class Partner(BaseModel):
    id: str
    name: str
    severity: str
    description: str
    contraindicated: bool


class DrugDetail(BaseModel):
    id: str
    name: str
    description: str | None
    mesh_id: str | None
    synonyms: list[str]
    smiles: str | None
    inchi: str | None
    inchikey: str | None
    identifiers: dict[str, list[str]]
    interaction_total: int
    by_severity: dict[str, int]
    partners: list[Partner]


class Stats(BaseModel):
    drugs: int
    pairs: int
    graded: int
    with_3d: int
    drugbank: int
    pubchem: int
    ddinter: int
    kegg: int
    inchikey: int
    severity: dict[str, int]
