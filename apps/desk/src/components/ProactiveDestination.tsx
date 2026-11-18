import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { messageOf, type Api } from '../api';
import type { Room } from '../types';
import { useUnsavedChanges } from '../unsaved-changes';
import { ProactiveCard } from './ProactiveCard';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Field, FieldGroup, FieldLabel } from './ui/field';
import { SelectField, SelectItem } from './ui/select';
import { Skeleton } from './ui/skeleton';

export function ProactiveDestination({ api, canManage = false }: { api: Api; canManage?: boolean }) {
  const [saved, setSaved] = useState<{ roomId: string | null } | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [choice, setChoice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const pending = useRef(false);
  const dirty = !!saved && (choice || null) !== saved.roomId;
  const missing = !!choice && !rooms.some(room => room.id === choice);
  useUnsavedChanges(dirty, saving);

  useEffect(() => {
    let active = true;
    Promise.all([api.getSettings(), api.listRooms()]).then(([{ settings }, { rooms: list }]) => {
      if (!active) return;
      if (!settings.deliveryRoom) throw Error('The destination setting is unavailable.');
      setSaved(settings.deliveryRoom);
      setChoice(settings.deliveryRoom.roomId ?? '');
      setRooms(list.filter(room => !room.id.startsWith('_')));
    }).catch(err => { if (active) setError(`Could not load the destination. Reload the page to try again. ${messageOf(err)}`); });
    return () => { active = false; };
  }, [api]);

  async function save() {
    if (!saved || !dirty || pending.current || missing) return;
    pending.current = true; setSaving(true); setError(null); setConfirmed(false);
    const roomId = choice || null;
    try {
      await api.putSetting('deliveryRoom', { roomId });
      const { settings } = await api.getSettings();
      if (settings.deliveryRoom.roomId !== roomId) throw Error('The destination changed. Reload settings to review it.');
      setSaved(settings.deliveryRoom); setConfirmed(true);
    } catch (err) { setError(`Save was not confirmed. Your choice is kept. ${messageOf(err)}`); }
    finally { pending.current = false; setSaving(false); }
  }

  return <ProactiveCard title="Message destination" description="Morning briefs, proactive alerts and reflection proposals are sent here." footer={<>
    <p className="text-sm text-muted-foreground" role="status">{dirty ? 'Unsaved changes' : confirmed ? 'Saved.' : null}</p>
    <Button type="button" onClick={() => void save()} disabled={!canManage || !saved || !dirty || saving || missing}>{saving && <LoaderCircle data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />}Save destination</Button>
  </>}>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {!saved && !error && <Skeleton className="h-11 w-full" aria-label="Loading destination" />}
    {saved && <FieldGroup><Field data-disabled={saving} data-invalid={missing}>
      <FieldLabel htmlFor="proactive-destination">Destination</FieldLabel>
      <SelectField id="proactive-destination" value={choice} onValueChange={value => { setChoice(value); setError(null); setConfirmed(false); }} disabled={!canManage || saving} aria-invalid={missing}>
        <SelectItem value="">Default bot's chat</SelectItem>
        {missing && <SelectItem value={choice} disabled>Unavailable room ({choice})</SelectItem>}
        {rooms.filter(room => room.kind !== 'direct' || room.id === saved.roomId).map(room => <SelectItem key={room.id} value={room.id}>{room.kind === 'direct' ? 'Chat' : 'Room'}: {room.name || room.id}</SelectItem>)}
      </SelectField>
    </Field></FieldGroup>}
    {missing && <Alert variant="destructive"><AlertDescription>The saved room is unavailable. Choose another destination.</AlertDescription></Alert>}
  </ProactiveCard>;
}
