import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDealView, dealViewHref } from '../src/lib/deal-view';

test('deal view rejects ambiguous values and limits search length', () => {
  assert.deepEqual(parseDealView({q:['one','two'],view:'unknown',mine:'true',closed:'0'}), {q:'',view:'board',mine:false,closed:false});
  assert.equal(parseDealView({q:' x '.repeat(100)}).q.length,120);
});
test('switching deal views preserves search, owner and closed filters', () => {
  const state = parseDealView({q:'  STEM & IoT  ',mine:'1',closed:'1'});
  const url = new URL(dealViewHref(state,{view:'list'}),'http://localhost');
  assert.equal(url.searchParams.get('q'),'STEM & IoT');
  assert.equal(url.searchParams.get('mine'),'1');
  assert.equal(url.searchParams.get('closed'),'1');
  assert.equal(url.searchParams.get('view'),'list');
  assert.equal(dealViewHref(state,{q:'',mine:false,closed:false,view:'board'}),'/crm/deals');
});
