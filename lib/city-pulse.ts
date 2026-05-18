import { supabase } from '@/lib/supabase/client';

export type CityPulseLocation = { label: string; matchTerms: string[] };
export type CityPulseMovingItem = {
  id: string; title: string; imageUrl: string | null; category: string | null; condition: string | null;
  city: string | null; area: string | null; ownerDisplayName: string | null; openInterestCount: number; latestInterestAt: string | null;
};
export type CityPulseStoryItem = {
  id: string; title: string; imageUrl: string | null; category: string | null; city: string | null; area: string | null;
  ownerId: string | null; ownerDisplayName: string | null; storyLabel: 'حكاية العنصر' | 'ليه صاحبه بيبدله' | 'مفيد لمين'; storySnippet: string; createdAt: string | null;
};
export type CityPulsePerson = { id: string; displayName: string; username: string; avatarUrl: string | null; city: string | null; area: string | null; profileTagline: string | null; activeItemsCount: number };
export type CityPulseStoryAuthor = { id: string; displayName: string | null; username: string | null; avatarUrl: string | null };
export type CityPulseActiveStorySummary = { author: CityPulseStoryAuthor; storiesCount: number; latestCreatedAt: string };
export type CityPulseSnapshot = { location: CityPulseLocation; movingItems: CityPulseMovingItem[]; storyItems: CityPulseStoryItem[]; people: CityPulsePerson[]; activeStoryAuthors: CityPulseActiveStorySummary[] };

type ItemRow = { id: string; title: string | null; city: string | null; area: string | null; condition: string | null; owner_id: string | null; category_id: string | null; item_story?: string | null; swap_reason?: string | null; good_for?: string | null; created_at?: string | null };
const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
const clamp = (value: number | undefined, min: number, max: number, fallback: number) => {
  const n = Number(value); if (!Number.isFinite(n)) return fallback; return Math.min(max, Math.max(min, Math.floor(n)));
};

function normalizeCityPulseMatchTerms(matchTerms: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const term of matchTerms) {
    const normalized = term.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= 6) break;
  }
  return output;
}

const toSafeLikeTerm = (term: string) => term.replace(/[%(),]/g, ' ').replace(/\s+/g, ' ').trim();
const buildLocationOrFilter = (terms: string[]) => {
  const clauses: string[] = [];
  for (const term of terms.map(toSafeLikeTerm).filter(Boolean)) {
    clauses.push(`city.ilike.%${term}%`, `area.ilike.%${term}%`);
  }
  return clauses.join(',');
};

async function fetchCityPulseMovingItems(matchTerms: string[], limit: number): Promise<CityPulseMovingItem[]> {
  const { data: rpcRows, error: rpcError } = await supabase.rpc('get_public_city_pulse_moving_items', { p_match_terms: matchTerms, p_limit: clamp(limit, 1, 16, 8) });
  if (rpcError) throw rpcError;
  const rows = (rpcRows ?? []) as { item_id: string; open_interest_count: number | string | null; latest_interest_at: string | null }[];
  if (!rows.length) return [];
  const itemIds = rows.map((r) => r.item_id);
  const { data: items, error: itemsError } = await supabase.from('items').select('id,title,city,area,condition,owner_id,category_id').in('id', itemIds).eq('status', 'active');
  if (itemsError) throw itemsError;
  const valid = (items ?? []) as ItemRow[];
  const categoryIds = Array.from(
    new Set(valid.map((item) => item.category_id).filter((value): value is string => Boolean(value))),
  );
  const ownerIds = Array.from(
    new Set(valid.map((item) => item.owner_id).filter((value): value is string => Boolean(value))),
  );
  const [imagesRes, categoriesRes, profilesRes] = await Promise.all([
    supabase.from('item_images').select('item_id,image_url,is_primary,sort_order').in('item_id', itemIds),
    categoryIds.length
      ? supabase.from('categories').select('id,name_ar').in('id', categoryIds)
      : Promise.resolve({ data: [] as { id: string; name_ar: string | null }[], error: null }),
    ownerIds.length
      ? supabase.from('profiles').select('id,display_name').in('id', ownerIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[], error: null }),
  ]);
  if (imagesRes.error) throw imagesRes.error; if (categoriesRes.error) throw categoriesRes.error; if (profilesRes.error) throw profilesRes.error;
  const itemMap = new Map(valid.map((i) => [i.id, i]));
  const categoryMap = new Map(((categoriesRes.data ?? []) as { id: string; name_ar: string | null }[]).map((c) => [c.id, clean(c.name_ar)]));
  const ownerMap = new Map(((profilesRes.data ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, clean(p.display_name)]));
  const imageMap = new Map<string, string | null>();
  for (const id of itemIds) {
    const imgs = ((imagesRes.data ?? []) as any[]).filter((x) => x.item_id === id).sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) || (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
    imageMap.set(id, clean(imgs[0]?.image_url ?? null));
  }
  return rows.flatMap((r) => { const item = itemMap.get(r.item_id); if (!item) return []; return [{ id: item.id, title: clean(item.title) ?? 'عنصر بدون عنوان', imageUrl: imageMap.get(item.id) ?? null, category: item.category_id ? (categoryMap.get(item.category_id) ?? null) : null, condition: clean(item.condition), city: clean(item.city), area: clean(item.area), ownerDisplayName: item.owner_id ? (ownerMap.get(item.owner_id) ?? null) : null, openInterestCount: Number(r.open_interest_count ?? 0), latestInterestAt: r.latest_interest_at ?? null }]; });
}

async function fetchCityPulseStoryItems(matchTerms: string[], limit: number): Promise<CityPulseStoryItem[]> { const rawLimit = clamp(limit,1,16,8)*2; let q=supabase.from('items').select('id,title,category_id,city,area,owner_id,item_story,swap_reason,good_for,created_at,status').eq('status','active').or('item_story.not.is.null,swap_reason.not.is.null,good_for.not.is.null').order('created_at',{ascending:false}).limit(rawLimit); const or=buildLocationOrFilter(matchTerms); if (or) q=q.or(or); const {data,error}=await q; if(error) throw error; const rows=(data??[]) as ItemRow[]; const normalized=rows.map((row)=>{const a=clean(row.item_story); const b=clean(row.swap_reason); const c=clean(row.good_for); if(a) return {row,storyLabel:'حكاية العنصر' as const,storySnippet:a}; if(b) return {row,storyLabel:'ليه صاحبه بيبدله' as const,storySnippet:b}; if(c) return {row,storyLabel:'مفيد لمين' as const,storySnippet:c}; return null;}).filter(Boolean) as any[]; if(!normalized.length)return []; const ids=normalized.map((n)=>n.row.id); const cats=Array.from(new Set(normalized.map((n)=>n.row.category_id).filter(Boolean) as string[])); const owners=Array.from(new Set(normalized.map((n)=>n.row.owner_id).filter(Boolean) as string[])); const [im,cat,pr]=await Promise.all([supabase.from('item_images').select('item_id,image_url,is_primary,sort_order').in('item_id',ids), cats.length?supabase.from('categories').select('id,name_ar').in('id',cats):Promise.resolve({data:[],error:null}), owners.length?supabase.from('profiles').select('id,display_name').in('id',owners):Promise.resolve({data:[],error:null})]); if(im.error) throw im.error; if(cat.error) throw cat.error; if(pr.error) throw pr.error; const visible=new Set(((pr.data??[]) as any[]).map((p)=>p.id)); const ownerMap=new Map(((pr.data??[]) as any[]).map((p)=>[p.id,clean(p.display_name)])); const catMap=new Map(((cat.data??[]) as any[]).map((c)=>[c.id,clean(c.name_ar)])); return normalized.filter((n)=>!n.row.owner_id||visible.has(n.row.owner_id)).slice(0,clamp(limit,1,16,8)).map((n)=>{ const imgs=((im.data??[]) as any[]).filter((x)=>x.item_id===n.row.id).sort((a,b)=>Number(Boolean(b.is_primary))-Number(Boolean(a.is_primary))||((a.sort_order??9999)-(b.sort_order??9999))); return {id:n.row.id,title:clean(n.row.title)??'عنصر بدون عنوان',imageUrl:clean(imgs[0]?.image_url??null),category:n.row.category_id?(catMap.get(n.row.category_id)??null):null,city:clean(n.row.city),area:clean(n.row.area),ownerId:n.row.owner_id??null,ownerDisplayName:n.row.owner_id?(ownerMap.get(n.row.owner_id)??null):null,storyLabel:n.storyLabel,storySnippet:n.storySnippet,createdAt:n.row.created_at??null}; }); }

async function fetchCityPulsePeople(matchTerms: string[], limit: number): Promise<CityPulsePerson[]> { let q=supabase.from('profiles').select('id,display_name,username,avatar_url,profile_tagline,city,area,successful_swaps_count,created_at').not('username','is',null).order('successful_swaps_count',{ascending:false}).order('created_at',{ascending:false}).limit(clamp(limit,1,16,8)); const or=buildLocationOrFilter(matchTerms); if(or) q=q.or(or); const {data,error}=await q; if(error) throw error; const profiles=(data??[]) as any[]; if(!profiles.length) return []; const ids=profiles.map((p)=>p.id); const {data:items,error:itemsError}=await supabase.from('items').select('owner_id,id').eq('status','active').in('owner_id',ids); if(itemsError) throw itemsError; const counts=new Map<string,number>(); for(const it of (items??[]) as any[]){ if(!it.owner_id) continue; counts.set(it.owner_id,(counts.get(it.owner_id)??0)+1);} return profiles.map((p)=>({id:p.id,displayName:clean(p.display_name)??clean(p.username)??'مستخدم',username:clean(p.username)??'',avatarUrl:clean(p.avatar_url),city:clean(p.city),area:clean(p.area),profileTagline:clean(p.profile_tagline),activeItemsCount:counts.get(p.id)??0})); }

async function fetchCityPulseActiveStoryAuthors(matchTerms: string[], limit: number): Promise<CityPulseActiveStorySummary[]> { let q=supabase.from('profiles').select('id,display_name,username,avatar_url,city,area').order('created_at',{ascending:false}).limit(40); const or=buildLocationOrFilter(matchTerms); if(or) q=q.or(or); const {data:profiles,error}=await q; if(error) throw error; const nearby=(profiles??[]) as any[]; if(!nearby.length) return []; const map=new Map(nearby.map((p)=>[p.id,p])); const ids=nearby.map((p)=>p.id); const now=new Date().toISOString(); const {data:stories,error:se}=await supabase.from('stories').select('user_id,created_at,expires_at').in('user_id',ids).gt('expires_at',now).order('created_at',{ascending:false}); if(se) throw se; const grouped=new Map<string,{storiesCount:number;latestCreatedAt:string}>(); for(const s of (stories??[]) as any[]){ if(!s.user_id||!s.created_at) continue; const g=grouped.get(s.user_id); if(!g){grouped.set(s.user_id,{storiesCount:1,latestCreatedAt:s.created_at});}else{g.storiesCount+=1; if(Date.parse(s.created_at)>Date.parse(g.latestCreatedAt)) g.latestCreatedAt=s.created_at;} } return Array.from(grouped.entries()).map(([id,val])=>({author:{id,displayName:clean(map.get(id)?.display_name),username:clean(map.get(id)?.username),avatarUrl:clean(map.get(id)?.avatar_url)},storiesCount:val.storiesCount,latestCreatedAt:val.latestCreatedAt})).sort((a,b)=>Date.parse(b.latestCreatedAt)-Date.parse(a.latestCreatedAt)).slice(0,clamp(limit,1,16,10)); }

export async function fetchCityPulseSnapshot(input: { location: CityPulseLocation; limits?: { movingItems?: number; storyItems?: number; people?: number; storyAuthors?: number } }): Promise<CityPulseSnapshot> {
  const normalizedTerms = normalizeCityPulseMatchTerms(input.location.matchTerms);
  if (!normalizedTerms.length) return { location: input.location, movingItems: [], storyItems: [], people: [], activeStoryAuthors: [] };
  const movingLimit = clamp(input.limits?.movingItems, 1, 16, 8);
  const storyLimit = clamp(input.limits?.storyItems, 1, 16, 8);
  const peopleLimit = clamp(input.limits?.people, 1, 16, 8);
  const authorsLimit = clamp(input.limits?.storyAuthors, 1, 16, 10);
  const [movingItems, storyItems, people, activeStoryAuthors] = await Promise.all([
    fetchCityPulseMovingItems(normalizedTerms, movingLimit),
    fetchCityPulseStoryItems(normalizedTerms, storyLimit),
    fetchCityPulsePeople(normalizedTerms, peopleLimit),
    fetchCityPulseActiveStoryAuthors(normalizedTerms, authorsLimit),
  ]);
  return { location: input.location, movingItems, storyItems, people, activeStoryAuthors };
}
