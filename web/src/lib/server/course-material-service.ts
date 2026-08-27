/**
 * Course material service surface. The course service owns the transaction
 * boundary because material mutations also validate course lifecycle and
 * school assignment membership.
 */
export { createPlatformMaterial, createSchoolMaterial, updateCourseMaterial, deleteCourseMaterial, getCourseDeletionImpact } from "./school-course-service";
