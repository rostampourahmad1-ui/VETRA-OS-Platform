from pathlib import Path
p = Path('lib/api-spec/openapi.yaml')
s = p.read_text()
marker = '\ncomponents:'
addition = r'''
  /projects/{projectId}/timeline:
    get:
      summary: Get project Gantt timeline
      parameters:
        - in: path
          name: projectId
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Project phases and milestones
  /projects/{projectId}/phases:
    post:
      summary: Create a project phase
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/PhaseInput' }
      responses:
        '201': { description: Created }
  /projects/{projectId}/milestones:
    post:
      summary: Create a project milestone
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/MilestoneInput' }
      responses:
        '201': { description: Created }
  /workflows:
    get:
      summary: List tenant workflows
      responses: { '200': { description: OK } }
    post:
      summary: Define an approval workflow
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/WorkflowInput' }
      responses: { '201': { description: Created } }
  /workflows/{id}/runs:
    post:
      summary: Start an approval workflow
      responses: { '201': { description: Created } }
  /workflow-runs/{id}/decision:
    post:
      summary: Approve or reject the current workflow step
      requestBody:
        required: true
        content:
          application/json:
            schema: { type: object, required: [decision], properties: { decision: { type: string, enum: [approve, reject] } } }
      responses: { '200': { description: Updated workflow run } }
  /documents/upload:
    post:
      summary: Upload a document to local storage
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema: { $ref: '#/components/schemas/DocumentUpload' }
      responses: { '201': { description: Uploaded document } }
  /ai/assistant:
    post:
      summary: Ask the VETRA AI assistant
      requestBody:
        required: true
        content:
          application/json:
            schema: { type: object, required: [query], properties: { query: { type: string } } }
      responses: { '200': { description: Assistant answer } }
'''
schemas = r'''
    PhaseInput:
      type: object
      required: [name, startDate, endDate]
      properties:
        name: { type: string }
        startDate: { type: string, format: date }
        endDate: { type: string, format: date }
        progress: { type: integer, minimum: 0, maximum: 100 }
    MilestoneInput:
      type: object
      required: [name, dueDate]
      properties:
        name: { type: string }
        dueDate: { type: string, format: date }
        phaseId: { type: integer }
    WorkflowInput:
      type: object
      required: [name, entityType, steps]
      properties:
        name: { type: string }
        entityType: { type: string, example: expense }
        steps:
          type: array
          items:
            type: object
            required: [name, requiredPermission]
            properties:
              name: { type: string }
              requiredPermission: { type: string }
    DocumentUpload:
      type: object
      required: [file, projectId]
      properties:
        file: { type: string, format: binary }
        projectId: { type: integer }
'''
if '/projects/{projectId}/timeline:' not in s:
    s = s.replace(marker, addition + marker, 1)
if '    PhaseInput:' not in s:
    s += '\ncomponents:\n  schemas:\n' + schemas
p.write_text(s)
