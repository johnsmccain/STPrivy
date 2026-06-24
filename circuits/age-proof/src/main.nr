fn main(age: u64, threshold: pub u64) {
    assert(age >= threshold, "age does not meet threshold");
}

#[test]
fn test_age_meets_threshold() {
    // age 25 >= threshold 18: should pass
    main(25, 18);
}

#[test]
fn test_age_equals_threshold() {
    // age == threshold: boundary case, should pass
    main(18, 18);
}

#[test(should_fail)]
fn test_age_below_threshold() {
    // age 17 < threshold 18: should fail
    main(17, 18);
}

#[test(should_fail)]
fn test_age_zero_below_threshold() {
    // age 0 < threshold 18: should fail
    main(0, 18);
}
