fn main(accredited: bool, age: u64) {
    assert(accredited == true, "not accredited");
    assert(age >= 18, "must be adult");
}

#[test]
fn test_accredited_adult() {
    // Accredited and 25 years old
    main(true, 25);
}

#[test]
fn test_accredited_exactly_18() {
    // Accredited and exactly 18 (boundary)
    main(true, 18);
}

#[test(should_fail)]
fn test_not_accredited() {
    // Not accredited
    main(false, 25);
}

#[test(should_fail)]
fn test_accredited_minor() {
    // Accredited but under 18
    main(true, 17);
}

#[test(should_fail)]
fn test_not_accredited_minor() {
    // Neither accredited nor adult
    main(false, 16);
}
