// Publisher-owned playback; no Roku sessions, media or advertising are relayed.
const ID=/^[a-f0-9]{32}$/;
export function resolveRoku(item,{signal}={}) {
  signal?.throwIfAborted();
  const identity=ID.test(item?.sourceId??'')&&item?.freeGuestVerified===true&&item?.provider==='roku';
  const video=['film','episode'].includes(item?.kind)&&item?.mode==='roku-link'&&item?.id==='roku-'+item.sourceId;
  const series=item?.kind==='series'&&item?.mode==='series'&&item?.id==='roku-series-'+item.sourceId&&
    (item.externalOnly===true&&item.parentFreeOptionVerified===true||Number.isInteger(item.episodeCount)&&item.episodeCount>0);
  if(!identity||!(video||series))throw Error('This item has no verified official Roku watch link.');
  return {kind:'external',url:'https://app.roku.com/'+(series?'details/':'watch/')+item.sourceId};
}
