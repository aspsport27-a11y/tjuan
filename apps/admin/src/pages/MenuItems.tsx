import { useEffect, useState } from 'react';
import { formatRupiah } from '@fnb/shared';
import Layout from '../components/Layout';
import OutletSelector from '../components/OutletSelector';
import { useOutletStore } from '../store/outlet';
import { api, ApiError } from '../api/client';

interface Category {
  id: string;
  name: string;
}

interface MenuItem {
  id: string;
  category_id: string | null;
  name: string;
  price: string;
  track_stock: boolean;
  is_active: boolean;
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

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [trackStock, setTrackStock] = useState(true);

  const [recipeItemId, setRecipeItemId] = useState<string | null>(null);

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
    setError(null);
    try {
      await api.post('/menu-items', {
        name: name.trim(),
        price: Number(price),
        categoryId: categoryId || null,
        trackStock,
      });
      setName('');
      setPrice('');
      setCategoryId('');
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

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Menu</h1>
        <OutletSelector />
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <form onSubmit={handleCreate} className="mb-6 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Nama menu</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-56 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Harga (Rp)</label>
          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-32 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Kategori</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500">
            <option value="">- Tanpa kategori -</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} />
          Potong stok bahan
        </label>
        <button type="submit" className="rounded-lg bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-600">
          Tambah
        </button>
      </form>

      {loading ? (
        <p className="text-slate-500">Memuat...</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Harga</th>
                <th className="px-4 py-3">Stok bahan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
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
                    {it.track_stock && (
                      <button onClick={() => setRecipeItemId(it.id)} className="text-xs text-sky-600 hover:text-sky-800">
                        Resep
                      </button>
                    )}
                    {it.is_active && (
                      <button onClick={() => handleDeactivate(it.id)} className="text-xs text-red-500 hover:text-red-700">
                        Nonaktifkan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Belum ada menu
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {recipeItemId && (
        <RecipeModal menuItemId={recipeItemId} menuItemName={items.find((i) => i.id === recipeItemId)?.name ?? ''} onClose={() => setRecipeItemId(null)} />
      )}
    </Layout>
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
