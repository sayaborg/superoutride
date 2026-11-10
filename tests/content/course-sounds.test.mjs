import assert from 'node:assert/strict';
import test from 'node:test';
import { courseRaceTracks, readCourseSounds } from '../../src/content/course-sounds.ts';

const tracks = ['one', 'two'];
const document = (courses, race) => ({ format: 'superoutride.course-sounds', version: 1, courses, race });

test('course sounds admit their courses and known race tracks, each once', () => {
  assert.deepEqual(readCourseSounds(document(['a', 'b'], ['two', 'one']), tracks), {
    courses: ['a', 'b'],
    race: ['two', 'one'],
  });
  for (const [courses, race, code] of [
    [['a'], ['three'], 'unresolved_reference'],
    [['a'], ['one', 'one'], 'duplicate_id'],
    [['a', 'a'], ['one'], 'duplicate_id'],
    [['a'], [], 'invalid_shape'],
  ])
    assert.throws(
      () => readCourseSounds(document(courses, race), tracks),
      (error) => error.code === code,
    );
});

test("each course plays its one document's tracks, a product course its original's, and others none", () => {
  const sounds = [readCourseSounds(document(['a', 'raised-later'], ['one']), tracks)];
  const byCourse = courseRaceTracks(sounds, ['a', 'a-product', 'b']);
  assert.deepEqual(
    [...byCourse],
    [
      ['a', ['one']],
      ['a-product', ['one']],
      ['b', []],
    ],
  );
  assert.throws(
    () => courseRaceTracks([...sounds, readCourseSounds(document(['a'], ['two']), tracks)], ['a']),
    (error) => error.code === 'duplicate_id',
  );
});
