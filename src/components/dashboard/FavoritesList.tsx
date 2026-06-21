/**
 * FavoritesList.tsx — FULL & FINAL (UPDATED)
 *
 * Fix:
 * - removed unused React import
 */

export default function FavoritesList({ favorites }: { favorites: string[] }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Favorites</div>
        <div className="text-xs text-gray-400">{favorites.length}</div>
      </div>

      {favorites.length === 0 ? (
        <div className="text-sm text-gray-400">No favorites</div>
      ) : (
        <div className="space-y-2">
          {favorites.slice(0, 8).map((id) => (
            <a
              key={id}
              href={`/devices/${encodeURIComponent(id)}`}
              className="block text-sm text-sky-600 hover:underline truncate"
            >
              {id}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}