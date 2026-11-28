"""Dependency-free CTC alignment and metrics. Inputs are frame log probabilities."""
import math
from itertools import groupby


def collapse(ids, blank=0):
    return [token for token, _ in groupby(ids) if token != blank]


def edit_distance(reference, hypothesis):
    previous = list(range(len(hypothesis) + 1))
    for i, ref in enumerate(reference, 1):
        current = [i]
        for j, hyp in enumerate(hypothesis, 1):
            current.append(min(current[-1] + 1, previous[j] + 1,
                               previous[j - 1] + (ref != hyp)))
        previous = current
    return previous[-1]


def align(log_probs, target, blank=0):
    """Exact Viterbi path through CTC states, including repeat/blank constraints.

    Returns one state index per frame and the path log probability.
    A target occurrence has its own odd state even for repeated phone IDs.
    """
    if not target or not log_probs:
        raise ValueError("Audio frames and target phones must be nonempty")
    if blank in target:
        raise ValueError("Target must not contain CTC blank")
    if any(token < 0 or token >= len(log_probs[0]) for token in target):
        raise ValueError("Target token outside vocabulary")
    required = len(target) + sum(a == b for a, b in zip(target, target[1:]))
    if len(log_probs) < required:
        raise ValueError("Too few CTC frames for this reference, including repeats")
    states = [blank]
    for token in target:
        states.extend([token, blank])
    neg_inf = -math.inf
    previous = [neg_inf] * len(states)
    previous[0] = float(log_probs[0][blank])
    previous[1] = float(log_probs[0][target[0]])
    back = [[-1] * len(states)]
    for frame in log_probs[1:]:
        current, pointers = [], []
        for s, token in enumerate(states):
            candidates = [(previous[s], s)]
            if s > 0:
                candidates.append((previous[s - 1], s - 1))
            if s > 1 and token != blank and token != states[s - 2]:
                candidates.append((previous[s - 2], s - 2))
            best, origin = max(candidates, key=lambda pair: pair[0])
            current.append(best + float(frame[token]))
            pointers.append(origin)
        previous = current
        back.append(pointers)
    end = max((len(states) - 1, len(states) - 2), key=lambda s: previous[s])
    score = previous[end]
    if not math.isfinite(score):
        raise ValueError("No finite CTC alignment for reference")
    path = [end]
    for t in range(len(log_probs) - 1, 0, -1):
        path.append(back[t][path[-1]])
    return list(reversed(path)), score


def diagnostics(log_probs, target, id_to_phone, seconds_per_frame, blank=0):
    """GOP-like nonblank posterior margins, NOT calibrated pronunciation scores.

    For each reference occurrence, average log P(reference) - max log P(other
    phone) over frames assigned to its odd CTC state. Blank/UNK excluded from
    competitors. Blank-state frames are not treated as phone evidence.
    """
    path, score = align(log_probs, target, blank)
    competitors = [i for i in range(len(id_to_phone))
                   if i != blank and id_to_phone[i] != "[UNK]"]
    rows = []
    for occurrence, token in enumerate(target):
        frames = [t for t, state in enumerate(path) if state == 2 * occurrence + 1]
        alternatives = [i for i in competitors if i != token]
        if not alternatives:
            raise ValueError("Need at least two phone classes for posterior margins")
        margins = [log_probs[t][token] - max(log_probs[t][i] for i in alternatives)
                   for t in frames]
        posterior = sum(math.exp(log_probs[t][token]) for t in frames) / len(frames)
        rows.append({"index": occurrence, "phone": id_to_phone[token],
                     "ctc_start_s": frames[0] * seconds_per_frame,
                     "ctc_end_s": (frames[-1] + 1) * seconds_per_frame,
                     "evidence_frames": len(frames),
                     "mean_reference_posterior": posterior,
                     "gop_like_margin": sum(margins) / len(margins)})
    return {"phones": rows, "viterbi_log_probability": score,
            "mean_gop_like_margin": sum(r["gop_like_margin"] for r in rows) / len(rows),
            "calibrated_score": None,
            "warning": "Experimental CTC posterior margins; not human grades. "
                       "CTC emission spans are not phonetic boundaries or mora durations. "
                       "Forced alignment can force wrong speech onto the reference."}
