import { useState, useEffect, useRef } from 'react'
import { collection, onSnapshot, doc, updateDoc, deleteDoc, writeBatch, query, getDocs, addDoc, setDoc } from 'firebase/firestore'
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

const BLANK_FORM = { name: '', primaryStore: 'Walmart', category: 'Pantry', notes: '', secondaryStore: '', quantity: '' }
const itemToForm = item => ({
  name: item.name,
  primaryStore: item.primaryStore,
  secondaryStore: item.secondaryStore || '',
  category: item.category,
  notes: item.notes || '',
  quantity: item.quantity || '',
})

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
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStore, setFilterStore] = useState('All')
  const [filterCategory, setFilterCategory] = useState('All')
  const [showInactive, setShowInactive] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const [storePicker, setStorePicker] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [form, setForm] = useState(BLANK_FORM)

  // Groups state
  const [showGroups, setShowGroups] = useState(false)
  const [expandedGroupId, setExpandedGroupId] = useState(null)
  const [showNewGroupForm, setShowNewGroupForm] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [addingItemToGroup, setAddingItemToGroup] = useState(null) // group id
  const [groupItemForm, setGroupItemForm] = useState(BLANK_FORM)
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null)
  const [editingGroupName, setEditingGroupName] = useState(null) // { group, name }
  const [activatedGroup, setActivatedGroup] = useState(null) // group name for toast

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
    const unsub = onSnapshot(collection(db, 'groups'), (snap) => {
      setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    function dismiss() { setContextMenu(null) }
    window.addEventListener('click', dismiss)
    window.addEventListener('scroll', dismiss)
    return () => { window.removeEventListener('click', dismiss); window.removeEventListener('scroll', dismiss) }
  }, [contextMenu])

  async function toggleCheck(item) {
    const updates = { checked: !item.checked }
    if (!item.checked && item.pushed) {
      updates.primaryStore = item.secondaryStore
      updates.secondaryStore = item.primaryStore
      updates.pushed = false
    }
    await updateDoc(doc(db, 'items', item.id), updates)
  }

  async function toggleActive(item) {
    await updateDoc(doc(db, 'items', item.id), { active: !item.active })
    setContextMenu(null)
  }

  async function changeStore(item, newStore) {
    await updateDoc(doc(db, 'items', item.id), { primaryStore: newStore })
    setStorePicker(null)
  }

  async function pushToAlternate(item) {
    await updateDoc(doc(db, 'items', item.id), {
      primaryStore: item.secondaryStore,
      secondaryStore: item.primaryStore,
      pushed: true,
    })
    setContextMenu(null)
  }

  async function deleteItem(item) {
    await deleteDoc(doc(db, 'items', item.id))
    setConfirmDelete(null)
  }

  async function addItem() {
    if (!form.name.trim()) return
    if (editingItem) {
      await updateDoc(doc(db, 'items', editingItem.id), {
        name: form.name.trim(),
        primaryStore: form.primaryStore,
        secondaryStore: form.secondaryStore || null,
        category: form.category,
        notes: form.notes.trim() || null,
        quantity: form.quantity.trim() || null,
      })
      setEditingItem(null)
    } else {
      await addDoc(collection(db, 'items'), {
        name: form.name.trim(),
        primaryStore: form.primaryStore,
        secondaryStore: form.secondaryStore || null,
        category: form.category,
        notes: form.notes.trim() || null,
        quantity: form.quantity.trim() || null,
        active: true,
        checked: false,
      })
    }
    setForm(BLANK_FORM)
    setShowAddForm(false)
  }

  async function clearAll() {
    const checked = items.filter(i => i.checked)
    const batch = writeBatch(db)
    checked.forEach(i => batch.update(doc(db, 'items', i.id), { checked: false }))
    await batch.commit()
  }

  async function updateQuantity(item, quantity) {
    await updateDoc(doc(db, 'items', item.id), { quantity: quantity.trim() || null })
  }

  function openContextMenu(item, x, y) {
    setContextMenu({ item, x, y })
  }

  // --- Group functions ---

  async function activateGroup(group) {
    const batch = writeBatch(db)
    for (const gi of group.items || []) {
      const match = items.find(i => i.name.toLowerCase() === gi.name.toLowerCase())
      if (match) {
        batch.update(doc(db, 'items', match.id), { active: true, checked: false })
      } else {
        const ref = doc(collection(db, 'items'))
        batch.set(ref, {
          name: gi.name.trim(),
          primaryStore: gi.primaryStore,
          secondaryStore: gi.secondaryStore || null,
          category: gi.category,
          notes: gi.notes || null,
          active: true,
          checked: false,
        })
      }
    }
    await batch.commit()
    setActivatedGroup(group.name)
    setTimeout(() => setActivatedGroup(null), 2500)
    setShowGroups(false)
  }

  async function createGroup() {
    if (!newGroupName.trim()) return
    await addDoc(collection(db, 'groups'), { name: newGroupName.trim(), items: [] })
    setNewGroupName('')
    setShowNewGroupForm(false)
  }

  async function deleteGroup(group) {
    await deleteDoc(doc(db, 'groups', group.id))
    setConfirmDeleteGroup(null)
    if (expandedGroupId === group.id) setExpandedGroupId(null)
  }

  async function saveGroupName(group, newName) {
    if (!newName.trim() || newName.trim() === group.name) { setEditingGroupName(null); return }
    await updateDoc(doc(db, 'groups', group.id), { name: newName.trim() })
    setEditingGroupName(null)
  }

  async function addGroupItem(group) {
    if (!groupItemForm.name.trim()) return
    const newItem = {
      name: groupItemForm.name.trim(),
      primaryStore: groupItemForm.primaryStore,
      secondaryStore: groupItemForm.secondaryStore || null,
      category: groupItemForm.category,
      notes: groupItemForm.notes.trim() || null,
    }
    const updated = [...(group.items || []), newItem]
    await updateDoc(doc(db, 'groups', group.id), { items: updated })
    setGroupItemForm(BLANK_FORM)
    setAddingItemToGroup(null)
  }

  async function removeGroupItem(group, index) {
    const updated = group.items.filter((_, i) => i !== index)
    await updateDoc(doc(db, 'groups', group.id), { items: updated })
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
                onClick={() => setShowGroups(true)}
                className="text-sm bg-purple-100 hover:bg-purple-200 text-purple-700 px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                Groups
              </button>
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
                  <ItemRow key={item.id} item={item} onToggle={toggleCheck} onLongPress={openContextMenu} onUpdateQuantity={updateQuantity} />
                ))}
                {activeChecked.map(item => (
                  <ItemRow key={item.id} item={item} onToggle={toggleCheck} onLongPress={openContextMenu} onUpdateQuantity={updateQuantity} checked />
                ))}
                {showInactive && inactive.length > 0 && (
                  <>
                    {(activeUnchecked.length > 0 || activeChecked.length > 0) && (
                      <div className="px-4 py-1 bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">Inactive</div>
                    )}
                    {inactive.map(item => (
                      <ItemRow key={item.id} item={item} onToggle={toggleCheck} onLongPress={openContextMenu} onUpdateQuantity={updateQuantity} inactive />
                    ))}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Activated toast */}
      {activatedGroup && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
          ✓ "{activatedGroup}" added to list
        </div>
      )}

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
          {contextMenu.item.secondaryStore && (
            <button
              className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-50"
              onClick={() => pushToAlternate(contextMenu.item)}
            >
              ➡️ Not here — try {contextMenu.item.secondaryStore}
            </button>
          )}
          <button
            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-50"
            onClick={() => { setEditingItem(contextMenu.item); setForm(itemToForm(contextMenu.item)); setShowAddForm(true); setContextMenu(null) }}
          >
            ✏️ Edit Item
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

      {/* Delete Item Confirm Modal */}
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

      {/* Add / Edit Item Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => { setShowAddForm(false); setEditingItem(null); setForm(BLANK_FORM) }}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="font-semibold text-gray-900">{editingItem ? 'Edit Item' : 'Add Item'}</p>
              <button className="text-gray-400 text-xl leading-none" onClick={() => { setShowAddForm(false); setEditingItem(null); setForm(BLANK_FORM) }}>×</button>
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
                <label className="text-xs text-gray-500 font-medium mb-1 block">Quantity (optional)</label>
                <input
                  type="text"
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  placeholder="e.g. 2, 1 lb, 3 cans"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400"
                />
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
              <button className="flex-1 py-3.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors" onClick={() => { setShowAddForm(false); setEditingItem(null); setForm(BLANK_FORM) }}>
                Cancel
              </button>
              <button
                className={`flex-1 py-3.5 text-sm font-medium transition-colors border-l border-gray-100 ${
                  form.name.trim() ? 'text-blue-500 hover:bg-blue-50' : 'text-gray-300'
                }`}
                onClick={addItem}
                disabled={!form.name.trim()}
              >
                {editingItem ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Groups Panel */}
      {showGroups && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => { setShowGroups(false); setExpandedGroupId(null); setShowNewGroupForm(false); setAddingItemToGroup(null) }}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl flex flex-col"
            style={{ maxHeight: '85vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Groups header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <p className="font-semibold text-gray-900">Shopping Groups</p>
              <button
                className="text-gray-400 text-xl leading-none"
                onClick={() => { setShowGroups(false); setExpandedGroupId(null); setShowNewGroupForm(false); setAddingItemToGroup(null) }}
              >×</button>
            </div>

            {/* Groups list */}
            <div className="overflow-y-auto flex-1">
              {groups.length === 0 && !showNewGroupForm && (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">
                  No groups yet. Create one to get started.
                </div>
              )}

              {groups.map(group => (
                <div key={group.id} className="border-b border-gray-50">
                  {/* Group row */}
                  <div className="flex items-center gap-2 px-4 py-3">
                    {editingGroupName?.group.id === group.id ? (
                      <input
                        autoFocus
                        className="flex-1 text-sm text-gray-800 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-purple-400"
                        value={editingGroupName.name}
                        onChange={e => setEditingGroupName(s => ({ ...s, name: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveGroupName(group, editingGroupName.name)
                          if (e.key === 'Escape') setEditingGroupName(null)
                        }}
                        onBlur={() => saveGroupName(group, editingGroupName.name)}
                      />
                    ) : (
                      <button
                        className="flex-1 text-left"
                        onClick={() => setExpandedGroupId(expandedGroupId === group.id ? null : group.id)}
                      >
                        <span className="text-sm font-medium text-gray-800">{group.name}</span>
                        <span className="text-xs text-gray-400 ml-2">{(group.items || []).length} items</span>
                      </button>
                    )}

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        className="text-xs text-purple-600 bg-purple-50 hover:bg-purple-100 px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                        onClick={() => activateGroup(group)}
                        disabled={(group.items || []).length === 0}
                      >
                        Activate
                      </button>
                      <button
                        className="text-gray-400 hover:text-gray-600 px-1.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-xs"
                        onClick={() => setEditingGroupName({ group, name: group.name })}
                        title="Rename"
                      >
                        ✏️
                      </button>
                      <button
                        className="text-gray-400 hover:text-red-500 px-1.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors text-xs"
                        onClick={() => setConfirmDeleteGroup(group)}
                        title="Delete"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {/* Expanded: items in group */}
                  {expandedGroupId === group.id && (
                    <div className="bg-gray-50 border-t border-gray-100">
                      {(group.items || []).length === 0 && addingItemToGroup !== group.id && (
                        <p className="px-5 py-3 text-xs text-gray-400 italic">No items yet.</p>
                      )}
                      {(group.items || []).map((gi, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-100 last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 truncate">{gi.name}</p>
                            <p className="text-xs text-gray-400">{gi.primaryStore} · {gi.category}</p>
                          </div>
                          <button
                            className="text-gray-300 hover:text-red-400 text-lg leading-none flex-shrink-0 transition-colors"
                            onClick={() => removeGroupItem(group, idx)}
                          >×</button>
                        </div>
                      ))}

                      {/* Add item to group inline form */}
                      {addingItemToGroup === group.id ? (
                        <div className="px-4 py-3 space-y-2 border-t border-gray-100 bg-white">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Item name *"
                            value={groupItemForm.name}
                            onChange={e => setGroupItemForm(f => ({ ...f, name: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && addGroupItem(group)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-purple-400"
                          />
                          <div className="flex gap-2">
                            <select
                              value={groupItemForm.primaryStore}
                              onChange={e => setGroupItemForm(f => ({ ...f, primaryStore: e.target.value }))}
                              className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-700 focus:outline-none focus:border-purple-400"
                            >
                              {STORES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <select
                              value={groupItemForm.category}
                              onChange={e => setGroupItemForm(f => ({ ...f, category: e.target.value }))}
                              className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-700 focus:outline-none focus:border-purple-400"
                            >
                              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <input
                            type="text"
                            placeholder="Notes (optional)"
                            value={groupItemForm.notes}
                            onChange={e => setGroupItemForm(f => ({ ...f, notes: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-purple-400"
                          />
                          <div className="flex gap-2">
                            <button
                              className="flex-1 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                              onClick={() => { setAddingItemToGroup(null); setGroupItemForm(BLANK_FORM) }}
                            >Cancel</button>
                            <button
                              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                                groupItemForm.name.trim() ? 'bg-purple-500 hover:bg-purple-600 text-white' : 'bg-gray-100 text-gray-300'
                              }`}
                              onClick={() => addGroupItem(group)}
                              disabled={!groupItemForm.name.trim()}
                            >Add</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="w-full px-5 py-2.5 text-xs text-purple-600 hover:bg-purple-50 transition-colors text-left font-medium border-t border-gray-100"
                          onClick={() => { setAddingItemToGroup(group.id); setGroupItemForm(BLANK_FORM) }}
                        >
                          + Add item to group
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* New group form */}
              {showNewGroupForm && (
                <div className="px-4 py-3 flex gap-2 border-t border-gray-100">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Group name (e.g. Taco Night)"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') createGroup()
                      if (e.key === 'Escape') { setShowNewGroupForm(false); setNewGroupName('') }
                    }}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-purple-400"
                  />
                  <button
                    className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      newGroupName.trim() ? 'bg-purple-500 hover:bg-purple-600 text-white' : 'bg-gray-100 text-gray-300'
                    }`}
                    onClick={createGroup}
                    disabled={!newGroupName.trim()}
                  >Create</button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-4 py-3 flex-shrink-0">
              <button
                className="w-full py-2.5 text-sm font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors"
                onClick={() => { setShowNewGroupForm(true); setExpandedGroupId(null) }}
              >
                + New Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Group Confirm Modal */}
      {confirmDeleteGroup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6" onClick={() => setConfirmDeleteGroup(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-5">
              <p className="font-semibold text-gray-900 text-base">Delete group?</p>
              <p className="text-sm text-gray-500 mt-1 leading-snug">"{confirmDeleteGroup.name}" will be permanently removed. Items already on your shopping list won't be affected.</p>
            </div>
            <div className="flex border-t border-gray-100">
              <button className="flex-1 py-3.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors" onClick={() => setConfirmDeleteGroup(null)}>
                Cancel
              </button>
              <button className="flex-1 py-3.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors border-l border-gray-100" onClick={() => deleteGroup(confirmDeleteGroup)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemRow({ item, onToggle, onLongPress, onUpdateQuantity, checked = false, inactive = false }) {
  const longPressTimer = useRef(null)
  const [editingQty, setEditingQty] = useState(false)
  const [qtyValue, setQtyValue] = useState(item.quantity || '')
  const qtyInputRef = useRef(null)

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

  function openQtyEdit(e) {
    e.stopPropagation()
    setQtyValue(item.quantity || '')
    setEditingQty(true)
    setTimeout(() => qtyInputRef.current?.select(), 0)
  }

  function commitQty() {
    setEditingQty(false)
    if (qtyValue.trim() !== (item.quantity || '')) {
      onUpdateQuantity(item, qtyValue)
    }
  }

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-gray-50 transition-colors select-none ${
        inactive ? 'opacity-40' : checked ? 'bg-gray-50/50' : ''
      }`}
      onClick={() => onToggle(item)}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
        checked ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-gray-400'
      }`}>
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* Quantity badge — tap to edit */}
      {editingQty ? (
        <input
          ref={qtyInputRef}
          autoFocus
          type="text"
          value={qtyValue}
          onChange={e => setQtyValue(e.target.value)}
          onBlur={commitQty}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); commitQty() } }}
          onClick={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          placeholder="qty"
          className="w-14 text-center text-sm font-medium text-blue-600 border border-blue-300 rounded-md px-1 py-0.5 focus:outline-none focus:border-blue-500 flex-shrink-0"
        />
      ) : (
        <button
          className={`flex-shrink-0 min-w-[2.5rem] text-center text-sm font-medium rounded-md px-1.5 py-0.5 transition-colors ${
            item.quantity
              ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
              : 'text-gray-300 hover:text-blue-400 hover:bg-blue-50'
          }`}
          onClick={openQtyEdit}
          onTouchStart={e => { e.stopPropagation(); clearTimeout(longPressTimer.current) }}
          title="Set quantity"
        >
          {item.quantity || '—'}
        </button>
      )}

      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${
          checked ? 'line-through text-gray-400' : inactive ? 'text-gray-500' : 'text-gray-800'
        }`}>
          {item.name}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          <span className="text-xs text-gray-400">{item.category}</span>
          {item.secondaryStore && (
            <span className="text-xs text-gray-400">· also {item.secondaryStore}</span>
          )}
        </div>
        {item.notes && (
          <p className="text-xs text-amber-600 mt-0.5 italic">{item.notes}</p>
        )}
      </div>
    </div>
  )
}
