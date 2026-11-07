// Module entry: registers the 'cbse' service, cbse_* tools, offline intents and the cbse-author agent.
import { loadCurriculum, getSyllabus, listSubjects, findChapter } from './syllabus.js';
import { getBlueprint, scaleBlueprint, listBlueprints } from './blueprint.js';
import { buildQuestionPaper, renderPaper } from './qp.js';
import { chapterSet, mixedSet, difficultyLadder, revisionPlan } from './practice.js';
import { buildStudyMaterial } from './study.js';
import { checkAnswer, answerCheck, markingRows } from './marking.js';
import { validatePaper, validateQuestion } from './validators.js';
import * as doc from './doc.js';
import { defineTools, defineIntents, parseRequest } from './tools.js';

export const cbse = { loadCurriculum, getSyllabus, listSubjects, findChapter, getBlueprint, scaleBlueprint, listBlueprints, buildQuestionPaper, renderPaper, chapterSet, mixedSet, difficultyLadder, revisionPlan, buildStudyMaterial, checkAnswer, answerCheck, markingRows, validatePaper, validateQuestion, doc, parseRequest };

/** @param {object} k kernel API */
export async function register(k) {
  await loadCurriculum();
  k.services.set('cbse', cbse);
  for (const t of defineTools(k)) k.tools.register({ ...t, tags: ['cbse'] });
  for (const i of defineIntents(k)) k.intents.register(i);
  k.agents?.register?.({ id: 'cbse-author', name: 'CBSE Author', role: 'author', tier: 'smart', description: 'Builds CBSE-pattern papers, practice sets and study material with computed answers (EN/HI).',
    system: 'You create CBSE-pattern assessments. Always use the cbse_* tools; never hand-type numeric answers; validate with cbse_answer_check; flag verified:false items to the teacher.',
    tools: ['cbse_syllabus', 'cbse_blueprint', 'cbse_question_paper', 'cbse_practice_set', 'cbse_study_material', 'cbse_marking_scheme', 'cbse_case_study', 'cbse_assertion_reason', 'cbse_mcq_bank', 'cbse_answer_check'] });
}
export default register;
