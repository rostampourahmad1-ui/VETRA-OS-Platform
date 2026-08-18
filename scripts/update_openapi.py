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
    parameters:
      - in: path
        name: projectId
        required: true
        schema: { type: integer }
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
    parameters:
      - in: path
        name: projectId
        required: true
        schema: { type: integer }
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
    parameters:
      - in: path
        name: id
        required: true
        schema: { type: integer }
    post:
      summary: Start an approval workflow
      responses: { '201': { description: Created } }
  /workflow-runs/{id}/decision:
    parameters:
      - in: path
        name: id
        required: true
        schema: { type: integer }
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

# A previous version appended a second top-level `components` key.  YAML allows
# parsers to handle duplicate keys inconsistently, and Orval rejects this spec.
# Remove that exact legacy block before inserting the schemas into the original
# components section.  Keep this migration so re-running the script is safe.
legacy_schema_block = '\ncomponents:\n  schemas:\n' + schemas
components_before_migration = s.count('\ncomponents:')
if components_before_migration > 1:
    legacy_index = s.rfind(legacy_schema_block)
    if legacy_index == -1:
        raise RuntimeError('OpenAPI document contains duplicate components sections')
    s = s[:legacy_index] + s[legacy_index + len(legacy_schema_block):]

schemas_marker = '\ncomponents:\n  schemas:\n'
if '    PhaseInput:' not in s:
    if schemas_marker not in s:
        raise RuntimeError('OpenAPI document does not contain a components.schemas section')
    s = s.replace(schemas_marker, schemas_marker + schemas, 1)

if s.count('\ncomponents:') != 1:
    raise RuntimeError('OpenAPI document must contain exactly one top-level components section')

p.write_text(s)
