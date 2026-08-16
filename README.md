[简体中文](README.zh.md)

# keel — Spec-Driven Development Discipline Skill Pack

> Write the spec first, then the code. Turn "don't ship it broken" from a slogan into skills, tooling, and gates.

keel is a self-contained pluginized skill pack: five skills (Anchor → Spec → Probe → Build → Audit) constrain the agent's coding behavior, three tools provide spec generation and discipline review, and template variants adapt to task size. It works with plugin-everything harnesses such as dsh (DeepSeek Harness), and can also be used standalone without a harness.

## Why you need it

The three main causes of coding failure:

1. **Missing spec** — you start with vague requirements, and wrong implementation direction costs the most rework;
2. **Unverified assumptions** — treating "I assumed" as "it's a fact" builds the plan on quicksand;
3. **Engineering out of control** — doing too much (over-engineering) or drifting (scope creep).

keel's response: **write the spec and verify assumptions first; no implementation until the spec passes the gates. During implementation, use the rules to prevent over-engineering and change requests to prevent scope creep. Before delivery, audit each acceptance criterion one by one.** Discipline is enforced through skills/prompts that constrain agent behavior and through tools that provide deterministic checks — it does not rely on human self-discipline.

## Five-step discipline loop

| Step | Skill | Action | Artifact | Gate |
| --- | --- | --- | --- | --- |
| 1 Anchor | keel-anchor | Three boundary questions: what to do, what not to do, what success looks like | Three sentences | All three sentences verifiable |
| 2 Spec | keel-spec | Pick a template by size and generate the spec | SPEC.md | keel_review zero errors |
| 3 Probe | keel-probe | Register assumptions, flag risks, verify high-risk ones first | ASSUMPTIONS.md | All [High] assumptions resolved (enforced by KEEL-0303) |
| 4 Build | keel-build | Implement per the spec, follow the ten rules and the scope guardrails | Code | Spec frozen, changes go through change requests |
| 5 Audit | keel-audit | Check acceptance criteria one by one, record deviations and retro | AUDIT.md | No unaddressed ❌ (enforced by KEEL-0403) |

Failure post-mortems follow the same discipline: write a failure-cause spec first, verify assumptions, then fix.

## Quick start

### Option 1: Plug into dsh (pluginized harness)

1. Put this directory into your project, or copy it anywhere;
2. Create a `cordis.yml` patch (you can copy `cordis.example.yml` from the repo root) pointing to this plugin's entry:

```yaml
- insert:
    - id: keel
      name: '/absolute/path/spec-driven/src/index.ts'
```

3. Start the harness and load the patch:

```sh
dsh web --patch ./cordis.yml
```

Once loaded, the model gains three tools (`keel_catalog`, `keel_spec`, `keel_review`) and five skills (keel-anchor, keel-spec, keel-probe, keel-build, keel-audit). See [docs/INTEGRATION.md](docs/INTEGRATION.md) for details.

### Option 2: Bare-metal CLI (no harness)

```sh
node src/cli.ts catalog
node src/cli.ts scaffold spec SPEC.md "--title=Example" "--goal=Goal" "--in_scope=- behavior" "--out_of_scope=- not doing" "--requirements=- R-01" "--acceptance=- AC-01" "--verification=command"
node src/cli.ts review SPEC.md
```

Values containing spaces must be quoted (as above). `review` exits with code 0 when there are no errors (usable as a CI gate) and 1 when errors exist. Zero dependencies; runs directly on Node ≥ 22.18.

## Installing in DSH

keel ships a `dsh.bundle` manifest (`cordis.patch.yml`, referenced from `package.json`),
so it installs and activates in one command:

```sh
dsh plugin --profile demo add github:JohnXu22786/spec-driven
```

The bundler inserts a plugin row (`name: keel`) into the profile and dsh resolves the
package entry (`src/index.ts`), registering the three tools and five skills on load.
Manual local loading via a `cordis.yml` patch still works (see
[docs/INTEGRATION.md](docs/INTEGRATION.md)).

## Tool interface

| Tool | Purpose |
| --- | --- |
| `keel_catalog` | List the skills and templates (routing entry) |
| `keel_spec` | Generate spec-class files from a template (template/path/fields args; rejects the whole call if any field is missing) |
| `keel_review` | Review SPEC/ASSUMPTIONS/AUDIT files; outputs a report with rule IDs and line numbers |

## Spec templates (with variants)

| Template | Size | Use |
| --- | --- | --- |
| `spec.minimal` | Micro task | Single file, single behavior, done in under half an hour |
| `spec` | Standard | Regular feature tasks |
| `spec.feature` | Large task | Involves interfaces, data, and error paths |
| `assumptions` | — | Assumption register (risk levels + verification conclusions) |
| `audit` | — | Acceptance audit table (result + evidence + deviation + retro) |
| `change-request` | — | Change request (the only entry for scope changes after the spec is frozen) |

## Configuration

Passed via the `config` field of the host patch line (defaults are used without a harness):

```jsonc
{
  "strictness": "relaxed",        // relaxed | strict (strict upgrades warnings to errors)
  "requireAssumptions": true,     // require an ASSUMPTIONS*.md file in the same directory when reviewing a spec
  "maxFindings": 100              // cap on findings per review report (1–1000)
}
```

Invalid configuration fails at load time with a message containing fix guidance.

## Documentation index

- [docs/METHODOLOGY.md](docs/METHODOLOGY.md) — methodology overview: five-step discipline loop, the ten rules against over-engineering, scope-creep guardrails, review rule list (KEEL-*)
- [docs/INTEGRATION.md](docs/INTEGRATION.md) — dsh integration: loading, registration interface, the three ways to load skills, unload and reload
- [docs/PLANNING_BRIDGE.md](docs/PLANNING_BRIDGE.md) — bridging to planning/task-breakdown skills: how spec artifacts feed into planning
- [examples/](examples/) — good examples (spec/assumptions/audit) and counter-examples (demonstrating the review engine's findings)

## Development

```sh
npm test          # node --test all tests (zero test dependencies)
npm run typecheck # tsc --noEmit
npm run cli       # bare CLI
```

Running tests and type checks requires Node ≥ 22.18; `npm install` only installs dev-time type packages (typescript, @types/node); zero runtime dependencies.

## License

MIT, see [LICENSE](LICENSE).
