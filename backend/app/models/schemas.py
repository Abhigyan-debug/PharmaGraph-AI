from typing import Literal

from pydantic import BaseModel, Field, field_validator

MIN_DRUGS, MAX_DRUGS = 2, 10


class DrugOut(BaseModel):
    id: str
    name: str


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
