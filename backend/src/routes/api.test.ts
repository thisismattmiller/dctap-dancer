import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { errorHandler, notFoundHandler } from '../middleware/error-handler.js';

// Create a test app with mocked services
const createTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());
  return app;
};

// Mock the database services
const mockWorkspaces = new Map<string, { id: string; name: string; createdAt: number; updatedAt: number }>();
const mockShapes = new Map<string, Map<string, { id: number; shapeId: string; shapeLabel: string | null }>>();
let idCounter = 0;

vi.mock('../services/database.js', () => ({
  workspaceService: {
    init: vi.fn(),
    list: vi.fn(() => Array.from(mockWorkspaces.values())),
    get: vi.fn((id: string) => mockWorkspaces.get(id) || null),
    create: vi.fn((name: string) => {
      idCounter++;
      const id = `ws-${idCounter}`;
      const workspace = { id, name, createdAt: Date.now(), updatedAt: Date.now() };
      mockWorkspaces.set(id, workspace);
      mockShapes.set(id, new Map());
      return workspace;
    }),
    update: vi.fn((id: string, name: string) => {
      const ws = mockWorkspaces.get(id);
      if (!ws) return null;
      ws.name = name;
      ws.updatedAt = Date.now();
      return ws;
    }),
    delete: vi.fn((id: string) => {
      if (!mockWorkspaces.has(id)) return false;
      mockWorkspaces.delete(id);
      mockShapes.delete(id);
      return true;
    }),
    duplicate: vi.fn((id: string, newName: string) => {
      const existing = mockWorkspaces.get(id);
      if (!existing) return null;
      idCounter++;
      const newId = `ws-dup-${idCounter}`;
      const workspace = { id: newId, name: newName, createdAt: Date.now(), updatedAt: Date.now() };
      mockWorkspaces.set(newId, workspace);
      mockShapes.set(newId, new Map());
      return workspace;
    }),
    getUpdatedAt: vi.fn((id: string) => mockWorkspaces.get(id)?.updatedAt ?? null)
  },
  shapeService: {
    list: vi.fn((workspaceId: string) => {
      const shapes = mockShapes.get(workspaceId);
      return shapes ? Array.from(shapes.values()) : [];
    }),
    get: vi.fn((workspaceId: string, shapeId: string) => {
      const shapes = mockShapes.get(workspaceId);
      return shapes?.get(shapeId) || null;
    }),
    create: vi.fn((workspaceId: string, shapeId: string, shapeLabel?: string) => {
      const shapes = mockShapes.get(workspaceId) || new Map();
      const shape = {
        id: shapes.size + 1,
        shapeId,
        shapeLabel: shapeLabel || null,
        description: null,
        resourceURI: null,
        folderId: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      shapes.set(shapeId, shape as never);
      mockShapes.set(workspaceId, shapes);
      return shape;
    }),
    update: vi.fn(),
    delete: vi.fn((workspaceId: string, shapeId: string) => {
      const shapes = mockShapes.get(workspaceId);
      if (!shapes?.has(shapeId)) return false;
      shapes.delete(shapeId);
      return true;
    }),
    getUsages: vi.fn(() => [])
  },
  rowService: {
    list: vi.fn(() => []),
    get: vi.fn(() => null),
    create: vi.fn(),
    update: vi.fn(),
    bulkUpdate: vi.fn(() => []),
    delete: vi.fn(() => true),
    bulkDelete: vi.fn(() => 0),
    updateErrors: vi.fn(),
    reorder: vi.fn()
  },
  namespaceService: {
    list: vi.fn(() => []),
    get: vi.fn(() => null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(() => true)
  },
  folderService: {
    list: vi.fn(() => []),
    get: vi.fn(() => null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(() => true)
  },
  optionsService: {
    get: vi.fn(() => ({ useLCColumns: false })),
    update: vi.fn()
  }
}));

describe('API Routes', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = createTestApp();

    // Dynamically import routes after mocking
    const { default: workspacesRouter } = await import('./workspaces.js');
    const { default: shapesRouter } = await import('./shapes.js');

    app.use('/api/workspaces', workspacesRouter);
    app.use('/api/workspaces/:workspaceId/shapes', shapesRouter);
    app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
    app.use(notFoundHandler);
    app.use(errorHandler);
  });

  beforeEach(() => {
    mockWorkspaces.clear();
    mockShapes.clear();
    idCounter = 0;
    vi.clearAllMocks();
  });

  describe('Health Check', () => {
    it('GET /api/health should return ok', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });

  describe('Workspaces API', () => {
    describe('GET /api/workspaces', () => {
      it('should return empty list when no workspaces exist', async () => {
        const response = await request(app).get('/api/workspaces');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual([]);
      });

      it('should return list of workspaces', async () => {
        const { workspaceService } = await import('../services/database.js');
        workspaceService.create('Test Workspace 1');
        workspaceService.create('Test Workspace 2');

        const response = await request(app).get('/api/workspaces');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(2);
      });
    });

    describe('POST /api/workspaces', () => {
      it('should create a new workspace', async () => {
        const response = await request(app)
          .post('/api/workspaces')
          .send({ name: 'New Workspace' });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('New Workspace');
        expect(response.body.data.id).toBeDefined();
      });

      it('should return 400 when name is missing', async () => {
        const response = await request(app)
          .post('/api/workspaces')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should return 400 when name is empty', async () => {
        const response = await request(app)
          .post('/api/workspaces')
          .send({ name: '' });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/workspaces/:id', () => {
      it('should return workspace by id', async () => {
        const { workspaceService } = await import('../services/database.js');
        const created = workspaceService.create('Test Workspace');

        const response = await request(app).get(`/api/workspaces/${created.id}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('Test Workspace');
      });

      it('should return 404 for non-existent workspace', async () => {
        const response = await request(app).get('/api/workspaces/non-existent-id');

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe('WORKSPACE_NOT_FOUND');
      });
    });

    describe('PUT /api/workspaces/:id', () => {
      it('should update workspace name', async () => {
        const { workspaceService } = await import('../services/database.js');
        const created = workspaceService.create('Old Name');

        const response = await request(app)
          .put(`/api/workspaces/${created.id}`)
          .send({ name: 'New Name' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('New Name');
      });

      it('should return 404 for non-existent workspace', async () => {
        const response = await request(app)
          .put('/api/workspaces/non-existent-id')
          .send({ name: 'New Name' });

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });
    });

    describe('DELETE /api/workspaces/:id', () => {
      it('should delete workspace', async () => {
        const { workspaceService } = await import('../services/database.js');
        const created = workspaceService.create('To Delete');

        const response = await request(app).delete(`/api/workspaces/${created.id}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should return 404 for non-existent workspace', async () => {
        const response = await request(app).delete('/api/workspaces/non-existent-id');

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/workspaces/:id/duplicate', () => {
      it('should duplicate workspace', async () => {
        const { workspaceService } = await import('../services/database.js');
        const created = workspaceService.create('Original');

        const response = await request(app)
          .post(`/api/workspaces/${created.id}/duplicate`)
          .send({ name: 'Duplicated' });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('Duplicated');
        expect(response.body.data.id).not.toBe(created.id);
      });

      it('should return 404 for non-existent workspace', async () => {
        const response = await request(app)
          .post('/api/workspaces/non-existent-id/duplicate')
          .send({ name: 'Duplicated' });

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Shapes API', () => {
    let workspaceId: string;

    beforeEach(async () => {
      const { workspaceService } = await import('../services/database.js');
      const workspace = workspaceService.create('Test Workspace');
      workspaceId = workspace.id;
    });

    describe('GET /api/workspaces/:workspaceId/shapes', () => {
      it('should return empty list when no shapes exist', async () => {
        const response = await request(app).get(`/api/workspaces/${workspaceId}/shapes`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual([]);
      });

      it('should return list of shapes', async () => {
        const { shapeService } = await import('../services/database.js');
        shapeService.create(workspaceId, 'Person', 'Person Shape');
        shapeService.create(workspaceId, 'Organization', 'Org Shape');

        const response = await request(app).get(`/api/workspaces/${workspaceId}/shapes`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(2);
      });

      it('should return 404 for non-existent workspace', async () => {
        const response = await request(app).get('/api/workspaces/non-existent/shapes');

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/workspaces/:workspaceId/shapes', () => {
      it('should create a new shape', async () => {
        const response = await request(app)
          .post(`/api/workspaces/${workspaceId}/shapes`)
          .send({ shapeId: 'Person', shapeLabel: 'Person Shape' });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.shapeId).toBe('Person');
        expect(response.body.data.shapeLabel).toBe('Person Shape');
      });

      it('should return 400 when shapeId is missing', async () => {
        const response = await request(app)
          .post(`/api/workspaces/${workspaceId}/shapes`)
          .send({ shapeLabel: 'No ID' });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should return 404 for non-existent workspace', async () => {
        const response = await request(app)
          .post('/api/workspaces/non-existent/shapes')
          .send({ shapeId: 'Person' });

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/workspaces/:workspaceId/shapes/:shapeId', () => {
      it('should return shape by id', async () => {
        const { shapeService } = await import('../services/database.js');
        shapeService.create(workspaceId, 'Person', 'Person Shape');

        const response = await request(app).get(`/api/workspaces/${workspaceId}/shapes/Person`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.shapeId).toBe('Person');
      });

      it('should return 404 for non-existent shape', async () => {
        const response = await request(app).get(`/api/workspaces/${workspaceId}/shapes/NonExistent`);

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe('SHAPE_NOT_FOUND');
      });
    });

    describe('DELETE /api/workspaces/:workspaceId/shapes/:shapeId', () => {
      it('should delete shape', async () => {
        const { shapeService } = await import('../services/database.js');
        shapeService.create(workspaceId, 'ToDelete', 'To Delete');

        const response = await request(app).delete(`/api/workspaces/${workspaceId}/shapes/ToDelete`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should return 404 for non-existent shape', async () => {
        const response = await request(app).delete(`/api/workspaces/${workspaceId}/shapes/NonExistent`);

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/api/non-existent-route');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('should handle JSON parsing errors', async () => {
      const response = await request(app)
        .post('/api/workspaces')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      // Express returns either 400 or 500 for JSON parsing errors depending on middleware
      expect([400, 500]).toContain(response.status);
    });
  });
});
