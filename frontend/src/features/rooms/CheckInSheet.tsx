import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { FormSheet } from '@/components/ui/FormSheet'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { checkIn, listRooms } from '@/services/rooms'
import type { Room } from '@/types/room'

interface CheckInSheetProps {
  open: boolean
  onClose: () => void
  onCheckedIn: () => void
  /** Pre-select this room (e.g. from the Rooms page). */
  initialRoomId?: string | null
}

/**
 * Shared guest check-in: pick a free room + guest name, then check in
 * through the standard room API. Used by Dashboard (New Guest) and Rooms.
 */
export function CheckInSheet({ open, onClose, onCheckedIn, initialRoomId = null }: CheckInSheetProps) {
  const { selectedBuId } = useBusinessUnit()
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomId, setRoomId] = useState('')
  const [guestName, setGuestName] = useState('')
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const errorRef = useRef<HTMLParagraphElement>(null)

  // Failed submits move keyboard/screen-reader focus to the error summary.
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  useEffect(() => {
    if (!open) return
    setRoomId('')
    setGuestName('')
    setError(null)
    setPending(false)
    setLoadingRooms(true)
    void listRooms({ business_unit_id: selectedBuId ?? undefined, status: 'free' })
      .then((res) => {
        const free = res.rooms.filter((r) => r.active && r.status === 'free')
        setRooms(free)
        if (initialRoomId && free.some((r) => r.id === initialRoomId)) {
          setRoomId(initialRoomId)
        }
      })
      .catch(() => setError('Could not load free rooms.'))
      .finally(() => setLoadingRooms(false))
  }, [open, selectedBuId, initialRoomId])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!roomId) return setError('Choose a free room for the guest.')
    if (!guestName.trim()) return setError('Enter the guest name to check in.')

    setPending(true)
    try {
      await checkIn({ room_id: roomId, guest_name: guestName.trim() })
      onCheckedIn()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed.')
    } finally {
      setPending(false)
    }
  }

  return (
    <FormSheet
      open={open}
      title="Check in guest"
      onClose={onClose}
      action={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onClose} className="whitespace-nowrap">
            Cancel
          </Button>
          <Button size="lg" pending={pending} type="submit" form="checkin-form" className="whitespace-nowrap">
            Check in
          </Button>
        </div>
      }
    >
      <form id="checkin-form" onSubmit={handleSubmit} className="space-y-3">
        {loadingRooms ? (
          <div className="space-y-2" aria-label="Loading free rooms">
            <div className="skeleton h-12 rounded-xl" />
            <div className="skeleton h-12 rounded-xl" />
          </div>
        ) : rooms.length === 0 && !error ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No free rooms right now — all rooms are occupied.
          </p>
        ) : (
          <>
            <Select label="Room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Select a free room…</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  Room {room.room_number}
                </option>
              ))}
            </Select>
            <Input
              label="Guest name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g. Sharma"
              autoComplete="off"
              maxLength={120}
            />
          </>
        )}

        {error && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
            {error}
          </p>
        )}
      </form>
    </FormSheet>
  )
}
