import { useEffect, useState } from 'react';
import { formatRupiah } from '@fnb/shared';
import Layout from '../components/Layout';
import OutletSelector from '../components/OutletSelector';
import { useOutletStore } from '../store/outlet';
import { GridPagination, GridToolbar, SortHeader, useGrid } from '../components/grid';
import { api, ApiError } from '../api/client';

interface Category {
  id: string;
  name: string;
}

interface MenuItem {
  id: string;
  category_id: string | null;
  sku: string | null;
  name: string;
  price: string;
  track_stock: boolean;
  is_active: boolean;
  hpp_source: 'recipe' | 'purchase_price';
  purchase_cost: string | null;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
}

interface RecipeRow {
  id: string;
  ingredient_id: string;
  name: string;
  unit: string;
  quantity: string;
}

export default function MenuItems() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const activeOutletId = useOutletStore((s) => s.activeOutletId);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const grid = useGrid(items, {
    searchFields: [(i) => i.name, (i) => i.sku],
    sortValue: (i, key) =>
      key === 'price' ? Number(i.price) : key === 'status' ? (i.is_active ? 1 : 0) : i.name,
    initialSort: { key: 'name' },
  });

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [trackStock, setTrackStock] = useState(true);
  const [hppSource, setHppSource] = useState<'recipe' | 'purchase_price'>('recipe');
  const [purchaseCost, setPurchaseCost] = useState('');

  const [recipeItemId, setRecipeItemId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [itemRes, catRes] = await Promise.all([
        api.get<{ menuItems: MenuItem[] }>('/menu-items'),
        api.get<{ categories: Category[] }>('/categories'),
      ]);
      setItems(itemRes.menuItems);
      setCategories(catRes.categories);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOutletId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !price) return;
    if (hppSource === 'purchase_price' && !purchaseCost) return;
    setError(null);
    try {
      await api.post('/menu-items', {
        name: name.trim(),
        price: Number(price),
        categoryId: categoryId || null,
        trackStock,
        hppSource,
        purchaseCost: hppSource === 'purchase_price' ? Number(purchaseCost) : undefined,
      });
      setName('');
      setPrice('');
      setCategoryId('');
      setHppSource('recipe');
      setPurchaseCost('');
      setShowForm(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await api.delete(`/menu-items/${id}`);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleActivate(id: string) {
    try {
      await api.put(`/menu-items/${id}`, { isActive: true });
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Menu</h1>
        <OutletSelector />
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <button
        onClick={() => setShowForm(true)}
        className="mb-4 rounded-lg bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-600"
      >
        + Tambah Menu
      </button>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleCreate} className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6">
            <h2 className="mb-4 text-lg font-bold text-slate-900">Tambah Menu</h2>

            <label className="mb-1 block text-xs text-slate-500">Nama menu</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" autoFocus />

            <label className="mb-1 block text-xs text-slate-500">Harga (Rp)</label>
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

            <label className="mb-1 block text-xs text-slate-500">Kategori</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500">
              <option value="">- Tanpa kategori -</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <label className="mb-4 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} />
              Potong stok bahan otomatis saat terjual
            </label>

            <HppSourceFields hppSource={hppSource} setHppSource={setHppSource} purchaseCost={purchaseCost} setPurchaseCost={setPurchaseCost} />

            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-slate-700 hover:bg-slate-200">
                Batal
              </button>
              <button type="submit" className="flex-1 rounded-lg bg-sky-500 py-2.5 font-medium text-white hover:bg-sky-600">
                Tambah
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Memuat...</p>
      ) : (
        <>
        <GridToolbar grid={grid} placeholder="Cari nama menu / SKU..." />
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <SortHeader grid={grid} sortKey="name">Nama</SortHeader>
                <SortHeader grid={grid} sortKey="price">Harga</SortHeader>
                <th className="px-4 py-3">Stok bahan</th>
                <SortHeader grid={grid} sortKey="status">Status</SortHeader>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((it) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{it.name}</td>
                  <td className="px-4 py-3 text-slate-700">{formatRupiah(Number(it.price))}</td>
                  <td className="px-4 py-3 text-slate-500">{it.track_stock ? 'Ya' : 'Tidak'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${it.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {it.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    <button onClick={() => setEditItem(it)} className="text-xs text-slate-600 hover:text-slate-900">
                      Edit
                    </button>
                    {it.track_stock && (
                      <button onClick={() => setRecipeItemId(it.id)} className="text-xs text-sky-600 hover:text-sky-800">
                        Resep
                      </button>
                    )}
                    {it.is_active ? (
                      <button onClick={() => handleDeactivate(it.id)} className="text-xs text-red-500 hover:text-red-700">
                        Nonaktifkan
                      </button>
                    ) : (
                      <button onClick={() => handleActivate(it.id)} className="text-xs text-emerald-600 hover:text-emerald-700">
                        Aktifkan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {grid.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    {grid.totalRows === 0 ? 'Belum ada menu' : 'Tidak ada menu yang cocok'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <GridPagination grid={grid} />
        </>
      )}

      {recipeItemId && (
        <RecipeModal menuItemId={recipeItemId} menuItemName={items.find((i) => i.id === recipeItemId)?.name ?? ''} onClose={() => setRecipeItemId(null)} />
      )}

      {editItem && (
        <EditModal
          item={editItem}
          categories={categories}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
            load();
          }}
        />
      )}
    </Layout>
  );
}

// Shared by the create form and the edit modal: pick whether HPP comes from
// the recipe (BOM) or a manually entered purchase cost -- resale items like
// bottled drinks have no recipe, so forcing them through one path silently
// reported HPP = 0 and overstated their margin in every report.
function HppSourceFields({
  hppSource,
  setHppSource,
  purchaseCost,
  setPurchaseCost,
}: {
  hppSource: 'recipe' | 'purchase_price';
  setHppSource: (v: 'recipe' | 'purchase_price') => void;
  purchaseCost: string;
  setPurchaseCost: (v: string) => void;
}) {
  return (
    <div className="mb-6">
      <label className="mb-1 block text-xs text-slate-500">Hitung HPP dari</label>
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          onClick={() => setHppSource('recipe')}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${hppSource === 'recipe' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-300 text-slate-600'}`}
        >
          Resep
        </button>
        <button
          type="button"
          onClick={() => setHppSource('purchase_price')}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${hppSource === 'purchase_price' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-300 text-slate-600'}`}
        >
          Harga Beli
        </button>
      </div>
      {hppSource === 'recipe' ? (
        <p className="text-xs text-slate-400">HPP dihitung dari bahan di resep (isi lewat tombol "Resep").</p>
      ) : (
        <>
          <label className="mb-1 block text-xs text-slate-500">Harga beli per porsi/unit (Rp)</label>
          <input
            type="number"
            value={purchaseCost}
            onChange={(e) => setPurchaseCost(e.target.value)}
            placeholder="mis. barang dijual kembali tanpa resep"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
          />
        </>
      )}
    </div>
  );
}

function EditModal({
  item,
  categories,
  onClose,
  onSaved,
}: {
  item: MenuItem;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price);
  const [categoryId, setCategoryId] = useState(item.category_id ?? '');
  const [trackStock, setTrackStock] = useState(item.track_stock);
  const [hppSource, setHppSource] = useState<'recipe' | 'purchase_price'>(item.hpp_source ?? 'recipe');
  const [purchaseCost, setPurchaseCost] = useState(item.purchase_cost ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !price) return;
    if (hppSource === 'purchase_price' && !purchaseCost) return;
    setError(null);
    setSaving(true);
    try {
      await api.put(`/menu-items/${item.id}`, {
        name: name.trim(),
        price: Number(price),
        categoryId: categoryId || null,
        trackStock,
        hppSource,
        purchaseCost: hppSource === 'purchase_price' ? Number(purchaseCost) : undefined,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={save} className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900">Edit Menu</h2>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <label className="mb-1 block text-xs text-slate-500">Nama menu</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" autoFocus />

        <label className="mb-1 block text-xs text-slate-500">Harga (Rp)</label>
        <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

        <label className="mb-1 block text-xs text-slate-500">Kategori</label>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500">
          <option value="">- Tanpa kategori -</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <label className="mb-4 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} />
          Potong stok bahan otomatis saat terjual
        </label>

        <HppSourceFields hppSource={hppSource} setHppSource={setHppSource} purchaseCost={purchaseCost} setPurchaseCost={setPurchaseCost} />

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-slate-700 hover:bg-slate-200">
            Batal
          </button>
          <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-sky-500 py-2.5 font-medium text-white hover:bg-sky-600 disabled:opacity-50">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </form>
    </div>
  );
}

function RecipeModal({ menuItemId, menuItemName, onClose }: { menuItemId: string; menuItemName: string; onClose: () => void }) {
  const [recipe, setRecipe] = useState<RecipeRow[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientId, setIngredientId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [recipeRes, ingRes] = await Promise.all([
      api.get<{ recipe: RecipeRow[] }>(`/menu-items/${menuItemId}/recipe`),
      api.get<{ ingredients: Ingredient[] }>('/ingredients'),
    ]);
    setRecipe(recipeRes.recipe);
    setIngredients(ingRes.ingredients);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : 'Gagal memuat resep'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuItemId]);

  function addRow() {
    if (!ingredientId || !quantity) return;
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) return;
    setRecipe((prev) => [...prev, { id: `new-${ingredientId}`, ingredient_id: ingredientId, name: ing.name, unit: ing.unit, quantity }]);
    setIngredientId('');
    setQuantity('');
  }

  function removeRow(ingredientIdToRemove: string) {
    setRecipe((prev) => prev.filter((r) => r.ingredient_id !== ingredientIdToRemove));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.put(
        `/menu-items/${menuItemId}/recipe`,
        recipe.map((r) => ({ ingredientId: r.ingredient_id, quantity: Number(r.quantity) })),
      );
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <h3 className="mb-1 text-lg font-bold text-slate-900">Resep: {menuItemName}</h3>
        <p className="mb-4 text-xs text-slate-500">Jumlah bahan yang terpakai untuk 1 porsi</p>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <div className="mb-4 space-y-2">
          {recipe.map((r) => (
            <div key={r.ingredient_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span>{r.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">{r.quantity} {r.unit}</span>
                <button onClick={() => removeRow(r.ingredient_id)} className="text-red-500 hover:text-red-700">&times;</button>
              </div>
            </div>
          ))}
          {recipe.length === 0 && <p className="text-sm text-slate-400">Belum ada bahan</p>}
        </div>

        <div className="mb-6 flex items-end gap-2">
          <select value={ingredientId} onChange={(e) => setIngredientId(e.target.value)} className="flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm">
            <option value="">Pilih bahan</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
            ))}
          </select>
          <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qty" className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-sm" />
          <button onClick={addRow} className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700">+</button>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-slate-700 hover:bg-slate-200">Batal</button>
          <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-sky-500 py-2.5 font-medium text-white hover:bg-sky-600 disabled:opacity-50">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}
