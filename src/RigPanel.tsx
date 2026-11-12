import { Section } from './components';
import { bones, identity, uid } from './model';
import type { LimbName, Project, Selection, Vec3 } from './model';
export function RigPanel({
  project,
  id,
  onCommit,
  onSelect,
  getPosition,
}: {
  project: Project;
  id: string;
  onCommit: (update: (p: Project) => Project) => void;
  onSelect: (selection: Selection) => void;
  getPosition: (bone: string) => Vec3;
}) {
  const character = project.objects.find((o) => o.id === id)!;
  return (
    <Section title="Inverse Kinematics">
      {(
        [
          { limb: 'leftArm', end: 'leftHand', label: 'Left Hand' },
          { limb: 'rightArm', end: 'rightHand', label: 'Right Hand' },
          { limb: 'leftLeg', end: 'leftFoot', label: 'Left Foot' },
          { limb: 'rightLeg', end: 'rightFoot', label: 'Right Foot' },
        ] as const
      ).map(({ limb, end, label }) => {
        const constraint = character.ik?.[limb];
        return (
          <div className="ik-row" key={limb}>
            {constraint ? (
              <>
                <label className="check-row">
                  <input
                    aria-label={`${label} IK enabled`}
                    type="checkbox"
                    checked={constraint.enabled}
                    onChange={(e) =>
                      onCommit((p) => ({
                        ...p,
                        objects: p.objects.map((o) =>
                          o.id === id
                            ? {
                                ...o,
                                ik: {
                                  ...o.ik,
                                  [limb]: { ...constraint, enabled: e.target.checked },
                                },
                              }
                            : o,
                        ),
                      }))
                    }
                  />
                  {label}
                </label>
                <button
                  className="button compact"
                  onClick={() => onSelect({ id: constraint.targetId })}
                >
                  Select Control
                </button>
              </>
            ) : (
              <>
                <span>{label}</span>
                <button
                  className="button compact"
                  aria-label={`Create ${label} IK control`}
                  disabled={project.objects.length >= 500}
                  onClick={() => {
                    const controlId = uid(),
                      position = getPosition(end),
                      side = limb.startsWith('left') ? 1 : -1,
                      pole: Vec3 = [
                        side * 0.6,
                        limb.endsWith('Arm') ? 1.3 : 0.5,
                        limb.endsWith('Arm') ? -1 : 1,
                      ];
                    onCommit((p) => ({
                      ...p,
                      objects: [
                        ...p.objects.map((o) =>
                          o.id === id
                            ? {
                                ...o,
                                ik: {
                                  ...o.ik,
                                  [limb]: { targetId: controlId, pole, enabled: true },
                                },
                              }
                            : o,
                        ),
                        {
                          id: controlId,
                          name: `${character.name} · ${label}`,
                          type: 'control',
                          parentId: id,
                          visible: true,
                          transform: { ...identity(), position },
                        },
                      ],
                    }));
                    onSelect({ id: controlId });
                  }}
                >
                  Create Control
                </button>
              </>
            )}
          </div>
        );
      })}
      <p className="hint">
        Move a control with G or animate its position. Elbows and knees bend toward it. Disable IK
        to return to the bone animation. The rig exposes {bones.length} pose channels.
      </p>
    </Section>
  );
}
