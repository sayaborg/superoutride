import { wrapPositive } from '../core/math.js';
export class CyclicVisualProfile {
    courseLength;
    sections;
    constructor(courseLength, sections) {
        this.courseLength = courseLength;
        const copied = sections.map((section) => ({ ...section })).sort((a, b) => a.sStart - b.sStart);
        if (copied.length === 0 || Math.abs(copied[0].sStart) > 1e-9) {
            throw new Error('visual profile must start at s=0');
        }
        this.sections = copied;
    }
    sample(s) {
        const local = wrapPositive(s, this.courseLength);
        let index = this.sections.length - 1;
        for (let i = 0; i < this.sections.length; i += 1) {
            if (this.sections[i].sStart <= local)
                index = i;
            else
                break;
        }
        return this.sections[index];
    }
    distanceToNextSection(s) {
        const local = wrapPositive(s, this.courseLength);
        for (const section of this.sections) {
            if (section.sStart > local + 1e-9)
                return section.sStart - local;
        }
        return this.courseLength - local;
    }
}
