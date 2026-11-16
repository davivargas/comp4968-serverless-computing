import pytest

from payroll_common import rates
from payroll_common.payroll import F, cents, half_up

"""Sanity checks on the statutory rate tables in payroll_common.rates.

Approach: each year's CRA numbers are typed in by hand, so these tests
recompute the derived ones (maximums, bracket constants) from the base
rates. A typo in a new year's table fails here, not on a paystub.
"""

YEARS = sorted(rates.BY_YEAR)


@pytest.mark.parametrize("year", YEARS)
def test_cpp_figures_follow_from_rates(year):
    """Max CPP and the base credit cap are (YMPE - exemption) x rate,
    and the total rate is base + enhanced."""
    cpp = rates.BY_YEAR[year]["cpp"]
    pensionable = cpp["ympe"] - cpp["basic_exemption"]
    assert cents(cpp["max1"]) == half_up(pensionable * F(cpp["rate"]) * 100)
    base_max = half_up(pensionable * F(cpp["base_rate"]) * 100)
    assert cents(cpp["base_credit_max"]) == base_max
    assert F(cpp["rate"]) == F(cpp["base_rate"]) + F(cpp["enhanced_rate"])
    assert cpp["yampe"] > cpp["ympe"]


@pytest.mark.parametrize("year", YEARS)
def test_ei_maximum_follows_from_rate(year):
    """The max EI premium is maximum insurable earnings x the rate."""
    ei = rates.BY_YEAR[year]["ei"]
    assert cents(ei["max"]) == half_up(ei["mie"] * F(ei["rate"]) * 100)


@pytest.mark.parametrize("year", YEARS)
@pytest.mark.parametrize("scope", ["federal", "bc"])
def test_tax_brackets_are_consistent(year, scope):
    """Thresholds and rates rise, the first rate is the lowest rate, and
    each K constant follows from the previous one (within $1)."""
    table = rates.BY_YEAR[year]["tax"][scope]
    brackets = table["brackets"]
    assert brackets[0][0] == 0 and brackets[0][2] == 0
    assert F(brackets[0][1]) == F(table["lowest_rate"])
    for (a0, r0, k0), (a1, r1, k1) in zip(brackets, brackets[1:]):
        assert a1 > a0 and F(r1) > F(r0)
        assert abs(k1 - (k0 + (F(r1) - F(r0)) * a1)) <= 1


@pytest.mark.parametrize("year", YEARS)
def test_bc_reduction_phases_out_at_its_end(year):
    """The BC tax reduction shrinks from its max at start to $0 at end,
    so rate x (end - start) equals the max (within $1)."""
    red = rates.BY_YEAR[year]["tax"]["bc"]["reduction"]
    assert red["start"] < red["end"]
    span = red["end"] - red["start"]
    assert abs(F(red["rate"]) * span - red["max"]) <= 1


def test_periods_per_year_is_biweekly():
    """Annual amounts are spread over 26 pay periods, matching the
    14-day periods ensure_periods creates."""
    assert rates.PERIODS_PER_YEAR == 26
