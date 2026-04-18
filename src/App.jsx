import { useState, useEffect, useRef } from 'react'
import { collection, onSnapshot, doc, updateDoc, writeBatch, addDoc, query, getDocs } from 'firebase/firestore'
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

async function seedIfEmpty(db) {
  const q = query(collection(db, 'items'))
  const snap = await getDocs(q)
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

  useEffect(() => {
    seedIfEmpty(db).then(() => {
      const unsub = onSnapshot(collection(db, 'items'), (snap) => {
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      })
      return unsub
    })
  }, [])

  async function toggleCheck(item) {
    await updateDoc(doc(db, 'items', item.id), { checked: !item.checked })
  }

  async function toggleActive(item) {
    await updateDoc(doc(db, 'items', item.id), { active: !item.active })
  }

  async function clearAll() {
    const checked = items.filter(i => i.checked)
    const batch = writeBatch(db)
    checked.forEach(i => batch.update(doc(db, 'items', i.id), { checked: false }))
    await batch.commit()
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
            {checkedCount > 0 && (
              <button
                onClick={clearAll}
                className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors"
              >
                Clear All ✓
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
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
                showInactive
                  ? 'bg-gray-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                  <ItemRow key={item.id} item={item} onToggle={toggleCheck} onToggleActive={toggleActive} />
                ))}
                {activeChecked.map(item => (
                  <ItemRow key={item.id} item={item} onToggle={toggleCheck} checked />
                ))}
                {showInactive && inactive.length > 0 && (
                  <>
                    {inactive.length > 0 && (activeUnchecked.length > 0 || activeChecked.length > 0) && (
                      <div className="px-4 py-1 bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">Inactive</div>
                    )}
                    {inactive.map(item => (
                      <ItemRow key={item.id} item={item} onToggle={toggleCheck} inactive />
                    ))}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ItemRow({ item, onToggle, onToggleActive, checked = false, inactive = false }) {
  const longPressTimer = useRef(null)

  function handleTouchStart() {
    longPressTimer.current = setTimeout(() => onToggleActive(item), 600)
  }

  function handleTouchEnd() {
    clearTimeout(longPressTimer.current)
  }

  function handleContextMenu(e) {
    e.preventDefault()
    onToggleActive(item)
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
        checked
          ? 'bg-green-500 border-green-500'
          : 'border-gray-300 hover:border-gray-400'
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
