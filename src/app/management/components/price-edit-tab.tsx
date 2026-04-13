"use client";

import { useEffect, useMemo, useState } from "react";
import {
  defaultCategories,
  getStoredCatalogProducts,
  saveStoredCatalogProducts,
} from "@/lib/gunstore/catalog";
import { CatalogProduct, VipMode } from "@/lib/gunstore/types";

function formatMoney(value: number) {
  return `$${value.toLocaleString()}`;
}

const emptyForm: CatalogProduct = {
  name: "",
  category: "Ammo",
  price: 0,
  vipMode: "none",
  vipPercent: 0,
  vipFixedPrice: 0,
};

export default function PriceEditTab() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [newProduct, setNewProduct] = useState<CatalogProduct>(emptyForm);
  const [customCategory, setCustomCategory] = useState("");

  useEffect(() => {
    setProducts(getStoredCatalogProducts());
  }, []);

  const allCategories = useMemo(() => {
    const merged = Array.from(
      new Set([
        ...defaultCategories.filter((c) => c !== "All"),
        ...products.map((p) => p.category),
      ])
    ).filter(Boolean);

    return ["All", ...merged];
  }, [products]);

  const formCategories = useMemo(() => {
    return allCategories.filter((c) => c !== "All");
  }, [allCategories]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === "All" || product.category === selectedCategory;
      const matchesSearch = product.name
        .toLowerCase()
        .includes(search.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, search]);

  function updateProduct<K extends keyof CatalogProduct>(
    productName: string,
    key: K,
    value: CatalogProduct[K]
  ) {
    setProducts((prev) =>
      prev.map((product) =>
        product.name === productName ? { ...product, [key]: value } : product
      )
    );
  }

  function saveAllChanges() {
    saveStoredCatalogProducts(products);
    setSaveMessage("Product catalog updated.");
    setTimeout(() => setSaveMessage(""), 2200);
  }

  function deleteProduct(productName: string) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${productName}" from the catalog?`
    );

    if (!confirmed) return;

    const updated = products.filter((product) => product.name !== productName);
    setProducts(updated);
    saveStoredCatalogProducts(updated);
    setSaveMessage("Product removed.");
    setTimeout(() => setSaveMessage(""), 2200);
  }

  function addNewProduct() {
    const finalCategory =
      newProduct.category === "__custom__"
        ? customCategory.trim()
        : newProduct.category.trim();

    const finalName = newProduct.name.trim();

    if (!finalName || !finalCategory) {
      setSaveMessage("Product name and category are required.");
      setTimeout(() => setSaveMessage(""), 2200);
      return;
    }

    const duplicate = products.some(
      (product) => product.name.toLowerCase() === finalName.toLowerCase()
    );

    if (duplicate) {
      setSaveMessage("A product with that name already exists.");
      setTimeout(() => setSaveMessage(""), 2200);
      return;
    }

    const createdProduct: CatalogProduct = {
      name: finalName,
      category: finalCategory,
      price: Number(newProduct.price) || 0,
      vipMode: newProduct.vipMode ?? "none",
      vipPercent: Number(newProduct.vipPercent) || 0,
      vipFixedPrice: Number(newProduct.vipFixedPrice) || 0,
    };

    const updated = [...products, createdProduct].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    setProducts(updated);
    saveStoredCatalogProducts(updated);
    setNewProduct(emptyForm);
    setCustomCategory("");
    setSaveMessage("New product added.");
    setTimeout(() => setSaveMessage(""), 2200);
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 rounded-xl border border-white/10 bg-black/20 p-4 xl:col-span-4">
        <div className="mb-4">
          <div className="text-sm font-semibold text-white">Product Management</div>
          <div className="text-xs text-zinc-400">
            Add new products and control pricing used in the employee dashboard.
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Product Name</label>
            <input
              value={newProduct.name}
              onChange={(e) =>
                setNewProduct((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Enter product name"
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Category</label>
            <select
              value={newProduct.category}
              onChange={(e) =>
                setNewProduct((prev) => ({ ...prev, category: e.target.value }))
              }
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
            >
              {formCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
              <option value="__custom__">Custom Category</option>
            </select>
          </div>

          {newProduct.category === "__custom__" && (
            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                Custom Category Name
              </label>
              <input
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="Enter new category"
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Base Price</label>
              <input
                type="number"
                min="0"
                value={newProduct.price}
                onChange={(e) =>
                  setNewProduct((prev) => ({
                    ...prev,
                    price: Number(e.target.value),
                  }))
                }
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">VIP Mode</label>
              <select
                value={newProduct.vipMode ?? "none"}
                onChange={(e) =>
                  setNewProduct((prev) => ({
                    ...prev,
                    vipMode: e.target.value as VipMode,
                  }))
                }
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
              >
                <option value="none">none</option>
                <option value="percent">percent</option>
                <option value="fixed">fixed</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">VIP Percent</label>
              <input
                type="number"
                min="0"
                value={newProduct.vipPercent ?? 0}
                onChange={(e) =>
                  setNewProduct((prev) => ({
                    ...prev,
                    vipPercent: Number(e.target.value),
                  }))
                }
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                VIP Fixed Price
              </label>
              <input
                type="number"
                min="0"
                value={newProduct.vipFixedPrice ?? 0}
                onChange={(e) =>
                  setNewProduct((prev) => ({
                    ...prev,
                    vipFixedPrice: Number(e.target.value),
                  }))
                }
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
              />
            </div>
          </div>

          <button
            onClick={addNewProduct}
            className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
          >
            Add Product
          </button>

          <div className="border-t border-white/10 pt-3">
            <div className="mb-3 text-sm font-semibold text-white">Catalog Filters</div>

            <div className="space-y-3">
              <input
                placeholder="Search product..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
              />

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
              >
                {allCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-zinc-400">Products Shown</div>
                <div className="mt-1 text-xl font-bold text-white">
                  {filteredProducts.length}
                </div>
              </div>

              <button
                onClick={saveAllChanges}
                className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
              >
                Save All Changes
              </button>

              {saveMessage && (
                <div className="text-xs text-green-300">{saveMessage}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="col-span-12 rounded-xl border border-white/10 bg-black/20 p-4 xl:col-span-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Catalog Products</div>
            <div className="text-xs text-zinc-400">
              Changes here control what appears in the employee dashboard.
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {filteredProducts.map((product) => (
            <div
              key={product.name}
              className="rounded-xl border border-white/10 bg-black/20 p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-white">
                    {product.name}
                  </div>
                  <div className="text-xs text-zinc-400">{product.category}</div>
                </div>

                <div className="text-sm font-semibold text-red-300">
                  Current Base: {formatMoney(product.price)}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    Category
                  </label>
                  <select
                    value={product.category}
                    onChange={(e) =>
                      updateProduct(product.name, "category", e.target.value)
                    }
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  >
                    {formCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    Base Price
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={product.price}
                    onChange={(e) =>
                      updateProduct(product.name, "price", Number(e.target.value))
                    }
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    VIP Mode
                  </label>
                  <select
                    value={product.vipMode ?? "none"}
                    onChange={(e) =>
                      updateProduct(product.name, "vipMode", e.target.value as VipMode)
                    }
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="none">none</option>
                    <option value="percent">percent</option>
                    <option value="fixed">fixed</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    VIP Percent
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={product.vipPercent ?? 0}
                    onChange={(e) =>
                      updateProduct(product.name, "vipPercent", Number(e.target.value))
                    }
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    VIP Fixed Price
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={product.vipFixedPrice ?? 0}
                    onChange={(e) =>
                      updateProduct(
                        product.name,
                        "vipFixedPrice",
                        Number(e.target.value)
                      )
                    }
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  />
                </div>
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => deleteProduct(product.name)}
                  className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/20"
                >
                  Delete Product
                </button>
              </div>
            </div>
          ))}

          {filteredProducts.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
              No products found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}