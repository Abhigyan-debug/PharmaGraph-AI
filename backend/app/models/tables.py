from sqlalchemy import ARRAY, CheckConstraint, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Drug(Base):
    __tablename__ = "drugs"

    drug_id: Mapped[str] = mapped_column(String(9), primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    name_normalized: Mapped[str] = mapped_column(Text, index=True)
    name_source: Mapped[str] = mapped_column(String(16))
    synonyms: Mapped[list[str]] = mapped_column(ARRAY(Text))
    drugbank_id: Mapped[str | None] = mapped_column(String(7), unique=True)
    pubchem_cid: Mapped[str | None] = mapped_column(String(12))
    smiles: Mapped[str | None] = mapped_column(Text)
    supported: Mapped[bool]
    supported_for_ml: Mapped[bool]
    source: Mapped[str] = mapped_column(String(16))
    dataset_version: Mapped[str] = mapped_column(Text)


class KnownInteraction(Base):
    __tablename__ = "known_interactions"
    __table_args__ = (
        UniqueConstraint("pair_key", "interaction_type"),
        CheckConstraint("drug_a_id < drug_b_id", name="pair_sorted"),
        CheckConstraint("severity_display IN ('major', 'moderate', 'minor', 'unknown')",
                        name="severity_enum"),
    )

    interaction_id: Mapped[str] = mapped_column(String(10), primary_key=True)
    pair_key: Mapped[str] = mapped_column(String(20))
    drug_a_id: Mapped[str] = mapped_column(ForeignKey("drugs.drug_id"))
    drug_b_id: Mapped[str] = mapped_column(ForeignKey("drugs.drug_id"))
    interaction_type: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(16))
    severity_display: Mapped[str] = mapped_column(String(8))
    severity_raw: Mapped[str | None] = mapped_column(Text)
    severity_sources: Mapped[str | None] = mapped_column(Text)
    dataset_version: Mapped[str] = mapped_column(Text)
