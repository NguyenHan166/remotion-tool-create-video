import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  PrismaProjectRepository,
  ProjectVersionConflictError,
  createPrismaClient,
  type PrismaClient,
} from '../../packages/database/src/index.js';
import { parseProjectDocument } from '../../packages/project-schema/src/index.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = testDatabaseUrl === undefined ? describe.skip : describe;
const createdProjectIds: string[] = [];
let database: PrismaClient;

integrationTest('Prisma project repository integration', () => {
  beforeAll(async () => {
    database = createPrismaClient(testDatabaseUrl!);
    await database.$connect();
  });

  afterEach(async () => {
    const projectIds = createdProjectIds.splice(0);

    if (projectIds.length > 0) {
      await database.project.deleteMany({
        where: {
          id: {
            in: projectIds,
          },
        },
      });
    }
  });

  afterAll(async () => {
    await database.$disconnect();
  });

  it('allows one optimistic update and rejects the stale writer', async () => {
    const repository = new PrismaProjectRepository(database);
    const document = parseProjectDocument({
      schemaVersion: 1,
      metadata: {
        title: 'Repository conflict test',
      },
      template: {
        id: 'warning-dark-v1',
      },
      scenes: [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          type: 'hook',
          name: 'Opening',
        },
      ],
    });
    const project = await repository.create({
      name: 'Repository conflict test',
      description: null,
      draftDocument: document,
    });
    createdProjectIds.push(project.id);

    const updates = await Promise.allSettled([
      repository.updateDraft({
        projectId: project.id,
        expectedDraftVersion: 1,
        name: 'Writer A',
        draftDocument: document,
      }),
      repository.updateDraft({
        projectId: project.id,
        expectedDraftVersion: 1,
        name: 'Writer B',
        draftDocument: document,
      }),
    ]);
    const fulfilled = updates.filter((result) => result.status === 'fulfilled');
    const rejected = updates.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: expect.objectContaining({
        code: 'PROJECT_VERSION_CONFLICT',
        expectedDraftVersion: 1,
        actualDraftVersion: 2,
      }),
    });
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ProjectVersionConflictError,
    );

    await expect(repository.findById(project.id)).resolves.toMatchObject({
      draftVersion: 2,
    });
  });
});
