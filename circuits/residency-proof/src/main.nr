fn main(country_code: [u8; 2], allowed_countries: pub [[u8; 2]; 10], allowed_count: pub u32) {
    let mut found = false;
    for i in 0..10u32 {
        if i < allowed_count {
            if country_code == allowed_countries[i] { found = true; }
        }
    }
    assert(found, "country not in allowed list");
}

#[test]
fn test_country_in_allowed_list() {
    // US is in allowed list
    main([85, 83], [[85, 83], [71, 66], [67, 65], [68, 69], [70, 82], [73, 84], [74, 80], [67, 72], [65, 85], [66, 82]], 10);
}

#[test]
fn test_country_at_boundary() {
    // First country in list
    main([85, 83], [[85, 83], [71, 66], [67, 65], [68, 69], [70, 82], [73, 84], [74, 80], [67, 72], [65, 85], [66, 82]], 1);
}

#[test(should_fail)]
fn test_country_not_in_allowed_list() {
    // XX is not in allowed list
    main([88, 88], [[85, 83], [71, 66], [67, 65], [68, 69], [70, 82], [73, 84], [74, 80], [67, 72], [65, 85], [66, 82]], 10);
}

#[test(should_fail)]
fn test_empty_allowed_list() {
    // No countries allowed
    main([85, 83], [[85, 83], [71, 66], [67, 65], [68, 69], [70, 82], [73, 84], [74, 80], [67, 72], [65, 85], [66, 82]], 0);
}
