import { writeFixtures } from '../tests/fixtures';
import { demoProject } from '../src/model';
import { writeFileSync } from 'node:fs';
writeFixtures('test-results/fixtures');
writeFileSync('test-results/fixtures/woodland.voxel', JSON.stringify(demoProject()));
