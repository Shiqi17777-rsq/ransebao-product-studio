from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def resolve_root(root_arg: str | None) -> Path:
    if root_arg:
        return Path(root_arg).expanduser().resolve()
    return Path(__file__).resolve().parents[2]


def resolve_runtime_root(root: Path, runtime_arg: str | None) -> Path:
    if runtime_arg:
        return Path(runtime_arg).expanduser().resolve()
    runtime_env = os.getenv("PRODUCT_STUDIO_RUNTIME_ROOT")
    if runtime_env:
        return Path(runtime_env).expanduser().resolve()
    return root / "runtime"


@dataclass(frozen=True)
class AppPaths:
    root: Path
    desktop_app_dir: Path
    engine_dir: Path
    adapters_dir: Path
    products_dir: Path
    runtime_dir: Path
    shared_dir: Path
    packaging_dir: Path
    runtime_config_dir: Path
    runtime_state_dir: Path
    runtime_logs_dir: Path
    runtime_outputs_dir: Path
    runtime_cache_dir: Path

    @classmethod
    def from_root(cls, root: Path, runtime_root: Path | None = None) -> "AppPaths":
        runtime_dir = (runtime_root or (root / "runtime")).expanduser().resolve()
        return cls(
            root=root,
            desktop_app_dir=root / "desktop-app",
            engine_dir=root / "engine",
            adapters_dir=root / "adapters",
            products_dir=root / "products",
            runtime_dir=runtime_dir,
            shared_dir=root / "shared",
            packaging_dir=root / "packaging",
            runtime_config_dir=runtime_dir / "config",
            runtime_state_dir=runtime_dir / "state",
            runtime_logs_dir=runtime_dir / "logs",
            runtime_outputs_dir=runtime_dir / "outputs",
            runtime_cache_dir=runtime_dir / "cache",
        )

    def product_dir(self, product_id: str) -> Path:
        return self.products_dir / product_id

    def product_sources_dir(self, product_id: str) -> Path:
        return self.product_dir(product_id) / "sources"

    def product_themes_dir(self, product_id: str) -> Path:
        return self.product_dir(product_id) / "themes"

    def runtime_product_dir(self, product_id: str) -> Path:
        return self.runtime_dir / product_id

    def runtime_product_cache_dir(self, product_id: str) -> Path:
        return self.runtime_product_dir(product_id) / "cache"

    def runtime_product_state_dir(self, product_id: str) -> Path:
        return self.runtime_product_dir(product_id) / "state"

    def runtime_product_outputs_dir(self, product_id: str) -> Path:
        return self.runtime_product_dir(product_id) / "outputs"
