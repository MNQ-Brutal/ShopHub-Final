import { useState, useEffect, useRef } from 'react'
import { collection, onSnapshot, doc, updateDoc, deleteDoc, writeBatch, query, getDocs, addDoc } from 'firebase/firestore'
import { db } from './firebase'
import { STORES, CATEGORIES, SEED_ITEMS } from './seedData'

const STORE_COLORS = {
  'Walmart': 'bg-blue-100 text-blue-800',
  'Kroger': 'bg-red-100 text-red-800',
  'Albertsons': 'bg-orange-100 text-orange-800',
  "Sam's Club": 'bg-indigo-100 text-indigo-800',
  'Costco': 'bg-red-100 text-red-900',
  'Whole Foods': 'bg-green-100 text-green-800',
}

const BLANK_FORM = { name: '', primaryStore: 'Walmart', category: 'Pantry', notes: '', secondaryStore: '' }

async function seedIfEmpty(db) {
  const snap = await getDocs(query(collection(db, 'items')))
  if (!snap.empty) return
  const batch = writeBatch(db)
  for (const item of SEED_ITEMS) {
    const ref = doc(collection(db, 'items'))
    batch.set(ref, { ...item, secondaryStore: item.secondaryStore || null, notes: item.notes || null })
  }
  await batch.commit()
}

export default function App() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStore, setFilterStore] = useState('All')
  const [filterCategory, setFilterCategory] = useState('All')
  const [showInactive, setShowInactive] = useState(false)
  const [contextMenu, setContextMenu] = useState(null) // { item, x, y }
  const [storePicker, setStorePicker] = useState(null) // item
  const [confirmDelete, setConfirmDelete] = useState(null) // item
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(BLANK_FORM)

  useEffect(() => {
    seedIfEmpty(db).then(() => {
      const unsub = onSnapshot(collection(db, 'items'), (snap) => {
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      })
      return unsub
    })
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    function dismiss() { setContextMenu(null) }
    window.addEventListener('click', dismiss)
    window.addEventListener('scroll', dismiss)
    return () => { window.removeEventListener('click', dismiss); window.removeEventListener('scroll', dismiss) }
  }, [contextMenu])

  async function toggleCheck(item) {
    await updateDoc(doc(db, 'items', item.id), { checked: !item.checked })
  }

  async function toggleActive(item) {
    await updateDoc(doc(db, 'items', item.id), { active: !item.active })
    setContextMenu(null)
  }

  async function changeStore(item, newStore) {
    await updateDoc(doc(db, 'items', item.id), { primaryStore: newStore })
    setStorePicker(null)
  }

  async function deleteItem(item) {
    await deleteDoc(doc(db, 'items', item.id))
    setConfirmDelete(null)
  }

  async function addItem() {
    if (!form.name.trim()) return
    await addDoc(collection(db, 'items'), {
      name: form.name.trim(),
      primaryStore: form.primaryStore,
      secondaryStore: form.secondaryStore || null,
      category: form.category,
      notes: form.notes.trim() || null,
      active: true,
      checked: false,
    })
    setForm(BLANK_FORM)
    setShowAddForm(false)
  }

  async function clearAll() {
    const checked = items.filter(i => i.checked)
    const batch = writeBatch(db)
    checked.forEach(i => batch.update(doc(db, 'items', i.id), { checked: false }))
    await batch.commit()
  }

  function openContextMenu(item, x, y) {
    setContextMenu({ item, x, y })
  }

  const activeStores = filterStore === 'All' ? STORES : [filterStore]

  const visibleItems = items.filter(item => {
    if (filterStore !== 'All' && item.primaryStore !== filterStore) return false
    if (filterCategory !== 'All' && item.category !== filterCategory) return false
    return true
  })

  const checkedCount = items.filter(i => i.checked && i.active).length
  const totalActive = items.filter(i => i.active).length

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-lg">Loading list...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Shopping List</h1>
              <p className="text-xs text-gray-400 mt-0.5">{checkedCount} of {totalActive} active items checked</p>
            </div>
            <div className="flex items-center gap-2">
              {checkedCount > 0 && (
                <button
                  onClick={clearAll}
                  className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Clear All ✓
                </button>
              )}
              <button
                onClick={() => setShowAddForm(true)}
                className="text-sm bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                + Add
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <select
              value={filterStore}
              onChange={e => setFilterStore(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 flex-shrink-0"
            >
              <option value="All">All Stores</option>
              {STORES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 flex-shrink-0"
            >
              <option value="All">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={() => setShowInactive(v => !v)}
              className={`text-sm px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors ${
                showInactive ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {showInactive ? 'Hide Inactive' : 'Show Inactive'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-6">
        {activeStores.map(store => {
          const storeItems = visibleItems.filter(i => i.primaryStore === store)
          if (storeItems.length === 0) return null

          const activeUnchecked = storeItems.filter(i => i.active && !i.checked)
          const activeChecked = storeItems.filter(i => i.active && i.checked)
          const inactive = storeItems.filter(i => !i.active)

          const hasContent = activeUnchecked.length > 0 || activeChecked.length > 0 || (showInactive && inactive.length > 0)
          if (!hasContent) return null

          return (
            <div key={store} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className={`px-4 py-2.5 flex items-center gap-2 ${STORE_COLORS[store]}`}>
                <span className="font-semibold text-sm">{store}</span>
                <span className="text-xs opacity-60 ml-auto">
                  {activeChecked.length}/{activeUnchecked.length + activeChecked.length}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {activeUnchecked.map(item => (
                  <ItemRow key={item.id} item={item} onToggle={toggleCheck} onLongPress={openContextMenu} />
                ))}
                {activeChecked.map(item => (
                  <ItemRow key={item.id} item={item} onToggle={toggleCheck} onLongPress={openContextMenu} checked />
                ))}
                {showInactive && inactive.length > 0 && (
                  <>
                    {(activeUnchecked.length > 0 || activeChecked.length > 0) && (
                      <div className="px-4 py-1 bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">Inactive</div>
                    )}
                    {inactive.map(item => (
                      <ItemRow key={item.id} item={item} onToggle={toggleCheck} onLongPress={openContextMenu} inactive />
                    ))}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden min-w-48"
          style={{
            top: contextMenu.y + 180 > window.innerHeight ? contextMenu.y - 180 : contextMenu.y,
            left: Math.min(contextMenu.x, window.innerWidth - 200)
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-4 py-2.5 border-b border-gray-50">
            <p className="text-xs font-medium text-gray-500 truncate">{contextMenu.item.name}</p>
          </div>
          <button
            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => toggleActive(contextMenu.item)}
          >
            {contextMenu.item.active ? '🔕 Mark Inactive' : '✅ Mark Active'}
          </button>
          <button
            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-50"
            onClick={() => { setStorePicker(contextMenu.item); setContextMenu(null) }}
          >
            🏪 Change Store
          </button>
          <button
            className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 transition-colors border-t border-gray-50"
            onClick={() => { setConfirmDelete(contextMenu.item); setContextMenu(null) }}
          >
            🗑 Delete Item
          </button>
        </div>
      )}

      {/* Store Picker Modal */}
      {storePicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setStorePicker(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="font-medium text-gray-900 text-sm truncate">{storePicker.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">Currently: {storePicker.primaryStore}</p>
            </div>
            {STORES.map(store => (
              <button
                key={store}
                className={`w-full text-left px-4 py-3.5 text-sm border-b border-gray-50 transition-colors ${
                  store === storePicker.primaryStore ? 'bg-gray-50 text-gray-400' : 'text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => changeStore(storePicker, store)}
                disabled={store === storePicker.primaryStore}
              >
                {store === storePicker.primaryStore ? `${store} (current)` : store}
              </button>
            ))}
            <button className="w-full px-4 py-3.5 text-sm text-gray-400 hover:bg-gray-50" onClick={() => setStorePicker(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-5">
              <p className="font-semibold text-gray-900 text-base">Delete item?</p>
              <p className="text-sm text-gray-500 mt-1 leading-snug">"{confirmDelete.name}" will be permanently removed.</p>
            </div>
            <div className="flex border-t border-gray-100">
              <button className="flex-1 py-3.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button className="flex-1 py-3.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors border-l border-gray-100" onClick={() => deleteItem(confirmDelete)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setShowAddForm(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="font-semibold text-gray-900">Add Item</p>
              <button className="text-gray-400 text-xl leading-none" onClick={() => setShowAddForm(false)}>×</button>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">Item name *</label>
                <input
                  autoFocus
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addItem()}
                  placeholder="e.g. Organic Apples"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">Store</label>
                <select
                  value={form.primaryStore}
                  onChange={e => setForm(f => ({ ...f, primaryStore: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400"
                >
                  {STORES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">Also at (optional)</label>
                <select
                  value={form.secondaryStore}
                  onChange={e => setForm(f => ({ ...f, secondaryStore: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400"
                >
                  <option value="">None</option>
                  {STORES.filter(s => s !== form.primaryStore).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">Notes (optional)</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. check the date"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
            <div className="flex border-t border-gray-100">
              <button className="flex-1 py-3.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors" onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
              <button
                className={`flex-1 py-3.5 text-sm font-medium transition-colors border-l border-gray-100 ${
                  form.name.trim() ? 'text-blue-500 hover:bg-blue-50' : 'text-gray-300'
                }`}
                onClick={addItem}
                disabled={!form.name.trim()}
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemRow({ item, onToggle, onLongPress, checked = false, inactive = false }) {
  const longPressTimer = useRef(null)

  function handleTouchStart(e) {
    const touch = e.touches[0]
    longPressTimer.current = setTimeout(() => onLongPress(item, touch.clientX, touch.clientY), 600)
  }

  function handleTouchEnd() {
    clearTimeout(longPressTimer.current)
  }

  function handleContextMenu(e) {
    e.preventDefault()
    onLongPress(item, e.clientX, e.clientY)
  }

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 cursor-pointer active:bg-gray-50 transition-colors select-none ${
        inactive ? 'opacity-40' : checked ? 'bg-gray-50/50' : ''
      }`}
      onClick={() => onToggle(item)}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
        checked ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-gray-400'
      }`}>
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${
          checked ? 'line-through text-gray-400' : inactive ? 'text-gray-500' : 'text-gray-800'
        }`}>
          {item.name}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span className="text-xs text-gray-400">{item.category}</span>
          {item.secondaryStore && (
            <span className="text-xs text-gray-400">· also {item.secondaryStore}</span>
          )}
        </div>
        {item.notes && (
          <p className="text-xs text-amber-600 mt-1 italic">{item.notes}</p>
        )}
      </div>
    </div>
  )
}
